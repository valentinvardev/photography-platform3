/**
 * Barrido periódico de fotos sin marca de agua.
 *
 * La marca ya se aplica al subir, pero si eso falla —la descarga desde S3 se
 * cuelga, el PNG de la marca no se puede traer, el proceso se reinicia a mitad
 * de una tanda— la foto queda con previewKey en null y nadie la vuelve a mirar.
 * Hasta ahora había que ir al panel o correr un script a mano, y mientras tanto
 * la foto no se puede mostrar: sin preview no sale a la galería.
 *
 * Esto la levanta sola. Cada pocos minutos busca las que quedaron sin preview y
 * las procesa, de a poco, sin pisar lo que esté haciendo el admin.
 *
 * Vive en el proceso del servidor, así que asume una sola instancia. Con pm2 en
 * modo cluster habría que dejarlo en una sola o moverlo a un worker aparte, o
 * varias copias harían el mismo trabajo.
 */

import { db } from "~/server/db";
import { isVideoMimeType } from "~/lib/video-utils";
import { hayTrabajoCorriendo } from "~/lib/reprocess-jobs";
import {
  registrarFallo,
  registrarExito,
  idsEnEspera,
  cantidadEnEspera,
  type Reintento,
} from "~/lib/watermark-queue";

/** Red de seguridad: cada tanto revisa por las dudas. */
const INTERVALO_MS = 5 * 60_000;

/** Cuánto tarda la primera pasada desde que arranca el servidor. */
const PRIMERA_PASADA_MS = 20_000;

/** Cuánto espera tras una subida antes de empezar, para juntar el lote entero. */
const TRAS_SUBIDA_MS = 3_000;

/** Fotos que trae de la base por vuelta. */
const POR_VUELTA = 48;

/**
 * Cuántas a la vez.
 *
 * El cuello es la red, no el CPU: medido en este servidor, bajar el original
 * son 2-4 s y subir el preview otros 1-2, contra ~320 ms de sharp. Con un
 * cuello de red conviene más paralelismo, porque el tiempo se va esperando, no
 * calculando. Se puede subir o bajar sin desplegar con WATERMARK_CONCURRENCIA.
 */
const CONCURRENCIA = Math.max(1, Number(process.env.WATERMARK_CONCURRENCIA ?? "8"));

/**
 * Techo de fotos por despertada. Alto a propósito: la idea es que una subida
 * quede terminada en la misma corrida, no que se estire en vueltas de cinco
 * minutos. Existe sólo para que un estado raro no lo deje girando sin fin.
 */
const MAX_POR_CORRIDA = 5_000;

/**
 * Reintentos con espera creciente. La lógica vive en watermark-queue.ts, pura
 * y testeada: acá sólo se consume. Ver ahí por qué se abandonó el contador de
 * "3 intentos de por vida" — dejaba fotos sin marca hasta reiniciar pm2.
 */
const reintentos = new Map<string, Reintento>();
let corriendo = false;
let pedidoPendiente = false;
let timer: NodeJS.Timeout | null = null;

/**
 * Avisa que hay fotos nuevas. Lo llama la subida apenas quedan registradas.
 *
 * Es lo que hace que el watermark salga enseguida y no dentro de cinco
 * minutos. La subida no procesa nada por su cuenta: sólo deja las filas y
 * avisa. Antes lanzaba el procesamiento en una promesa suelta después de
 * responder el request, y ese trabajo no tiene quién lo sostenga — si el
 * proceso lo descarta, nadie se entera y la foto queda sin preview. Acá el
 * trabajo vive en el servidor, igual que en el script que sí funcionaba.
 */
export function despertarBarrido(): void {
  if (corriendo) {
    pedidoPendiente = true;
    return;
  }
  setTimeout(() => void barrer(), TRAS_SUBIDA_MS);
}

export function iniciarBarridoWatermark(): void {
  if (timer) return;
  if (process.env.WATERMARK_SWEEPER === "off") {
    console.log("[barrido] desactivado por WATERMARK_SWEEPER=off");
    return;
  }

  console.log(
    `[barrido] activo — revisa cada ${INTERVALO_MS / 60000} min, ${POR_VUELTA} fotos por vuelta`,
  );
  setTimeout(() => void barrer(), PRIMERA_PASADA_MS);
  timer = setInterval(() => void barrer(), INTERVALO_MS);
  // No debe impedir que el proceso termine si alguien lo cierra.
  timer.unref?.();
}

async function barrer(): Promise<void> {
  if (corriendo) {
    pedidoPendiente = true;
    return;
  }

  corriendo = true;
  const arranque = Date.now();
  let hechas = 0;
  let fallidas = 0;

  try {
    const { runWatermark } = await import("~/lib/photo-processing");

    // Drena la cola entera, igual que el script: trae un lote, lo procesa, y
    // vuelve a preguntar. Hacer una tanda y esperar al intervalo dejaba una
    // subida de mil fotos estirada durante horas.
    while (hechas + fallidas < MAX_POR_CORRIDA) {
      // Sólo cede ante un reprocesado de marcas de agua: es el único que baja
      // originales y le competiría el ancho de banda. Los de dorsal y rostros
      // no mueven bytes.
      if (hayTrabajoCorriendo("watermark")) {
        console.log("[barrido] pausa: el admin está regenerando marcas de agua");
        break;
      }

      // Las apartadas por fallos recientes se excluyen EN LA CONSULTA. Si se
      // filtraran en memoria después (como antes), una ventana llena de
      // apartadas taparía a las fotos más viejas jamás intentadas y el barrido
      // cortaría creyendo que no queda nada.
      const enEspera = idsEnEspera(reintentos, Date.now());
      const cola = await db.photo.findMany({
        where: {
          previewKey: null,
          ...(enEspera.length ? { id: { notIn: enEspera } } : {}),
        },
        // Las más nuevas primero: son las del evento que se está publicando,
        // las que alguien está esperando ver.
        orderBy: { createdAt: "desc" },
        select: { id: true, mimeType: true, filename: true, storageKey: true, previewKey: true },
        take: POR_VUELTA,
      });

      if (cola.length === 0) break;

      let siguiente = 0;
      const worker = async () => {
        while (siguiente < cola.length) {
          const foto = cola[siguiente++]!;
          const esVideo =
            isVideoMimeType(foto.mimeType) ||
            /\.(mp4|mov|webm|mkv|m4v)$/i.test(foto.filename);

          try {
            let previewKey: string | null;
            if (esVideo) {
              // Import adentro del try y sólo si hace falta: si ffmpeg no está
              // instalable en este servidor, que falle ESTE video — antes el
              // import iba al arranque de la corrida y su fallo tumbaba el
              // barrido entero, fotos incluidas, sin procesar ninguna.
              const { runVideoWatermark } = await import("~/lib/video-processing");
              ({ previewKey } = await runVideoWatermark(foto.id));
            } else {
              ({ previewKey } = await runWatermark(foto.id, { foto }));
            }

            if (previewKey) {
              hechas++;
              registrarExito(reintentos, foto.id);
            } else {
              fallidas++;
              registrarFallo(reintentos, foto.id, Date.now());
            }
          } catch (err) {
            fallidas++;
            registrarFallo(reintentos, foto.id, Date.now());
            console.error(`[barrido] photoId=${foto.id} falló:`, err);
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCIA, cola.length) }, worker),
      );

      const restantes = await db.photo.count({ where: { previewKey: null } });
      const min = (Date.now() - arranque) / 60000;
      const ritmo = min > 0 ? Math.round(hechas / min) : 0;
      // El ritmo y el faltante son lo que permite decidir si hay que subir la
      // concurrencia o si el problema es otro.
      console.log(
        `[barrido] ${hechas} con marca, ${fallidas} fallidas, ${restantes} pendientes` +
          (ritmo > 0 ? ` · ${ritmo}/min, faltan ~${Math.ceil(restantes / ritmo)} min` : ""),
      );
    }

    if (hechas + fallidas > 0) {
      const seg = ((Date.now() - arranque) / 1000).toFixed(0);
      const apartadas = cantidadEnEspera(reintentos, Date.now());
      console.log(
        `[barrido] terminado en ${seg}s — ${hechas} con marca, ${fallidas} fallidas` +
          (apartadas > 0 ? `, ${apartadas} en espera de reintento` : ""),
      );
    }
  } catch (err) {
    console.error("[barrido] la corrida falló:", err);
  } finally {
    corriendo = false;
  }

  // Si llegaron fotos mientras trabajaba, otra vuelta.
  if (pedidoPendiente) {
    pedidoPendiente = false;
    setTimeout(() => void barrer(), TRAS_SUBIDA_MS);
  }
}
