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

/** Red de seguridad: cada tanto revisa por las dudas. */
const INTERVALO_MS = 5 * 60_000;

/** Cuánto tarda la primera pasada desde que arranca el servidor. */
const PRIMERA_PASADA_MS = 20_000;

/** Cuánto espera tras una subida antes de empezar, para juntar el lote entero. */
const TRAS_SUBIDA_MS = 3_000;

/** Fotos que trae de la base por vuelta. */
const POR_VUELTA = 24;

/** Cuántas a la vez. El watermark baja el original y lo pasa por sharp. */
const CONCURRENCIA = 4;

/**
 * Techo de fotos por despertada. Alto a propósito: la idea es que una subida
 * quede terminada en la misma corrida, no que se estire en vueltas de cinco
 * minutos. Existe sólo para que un estado raro no lo deje girando sin fin.
 */
const MAX_POR_CORRIDA = 5_000;

/**
 * Después de tantos intentos fallidos se deja de reintentar hasta el próximo
 * reinicio. Sin esto, una foto rota —el original borrado del bucket, por
 * ejemplo— se reintentaría cada cinco minutos para siempre.
 */
const MAX_INTENTOS = 3;

const intentos = new Map<string, number>();
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
    const { runVideoWatermark } = await import("~/lib/video-processing");

    // Drena la cola entera, igual que el script: trae un lote, lo procesa, y
    // vuelve a preguntar. Hacer una tanda y esperar al intervalo dejaba una
    // subida de mil fotos estirada durante horas.
    while (hechas + fallidas < MAX_POR_CORRIDA) {
      if (hayTrabajoCorriendo()) {
        console.log("[barrido] pausa: hay un reprocesado del admin en curso");
        break;
      }

      const pendientes = await db.photo.findMany({
        where: { previewKey: null },
        // Las más nuevas primero: son las del evento que se está publicando,
        // las que alguien está esperando ver.
        orderBy: { createdAt: "desc" },
        select: { id: true, mimeType: true, filename: true, storageKey: true, previewKey: true },
        take: POR_VUELTA * 3,
      });

      const cola = pendientes
        .filter((p) => (intentos.get(p.id) ?? 0) < MAX_INTENTOS)
        .slice(0, POR_VUELTA);

      if (cola.length === 0) break;

      let siguiente = 0;
      const worker = async () => {
        while (siguiente < cola.length) {
          const foto = cola[siguiente++]!;
          const esVideo =
            isVideoMimeType(foto.mimeType) ||
            /\.(mp4|mov|webm|mkv|m4v)$/i.test(foto.filename);

          try {
            const { previewKey } = esVideo
              ? await runVideoWatermark(foto.id)
              : await runWatermark(foto.id, { foto });

            if (previewKey) {
              hechas++;
              intentos.delete(foto.id);
            } else {
              fallidas++;
              intentos.set(foto.id, (intentos.get(foto.id) ?? 0) + 1);
            }
          } catch (err) {
            fallidas++;
            intentos.set(foto.id, (intentos.get(foto.id) ?? 0) + 1);
            console.error(`[barrido] photoId=${foto.id} falló:`, err);
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCIA, cola.length) }, worker),
      );

      const restantes = await db.photo.count({ where: { previewKey: null } });
      console.log(
        `[barrido] ${hechas} con marca, ${fallidas} fallidas, ${restantes} pendientes`,
      );
    }

    if (hechas + fallidas > 0) {
      const seg = ((Date.now() - arranque) / 1000).toFixed(0);
      const rendidas = [...intentos.values()].filter((n) => n >= MAX_INTENTOS).length;
      console.log(
        `[barrido] terminado en ${seg}s — ${hechas} con marca, ${fallidas} fallidas` +
          (rendidas > 0 ? `, ${rendidas} descartadas tras ${MAX_INTENTOS} intentos` : ""),
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
