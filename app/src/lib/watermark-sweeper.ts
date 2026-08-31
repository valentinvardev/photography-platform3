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

/** Cada cuánto mira si quedó algo pendiente. */
const INTERVALO_MS = 5 * 60_000;

/** Cuánto tarda la primera pasada desde que arranca el servidor. */
const PRIMERA_PASADA_MS = 45_000;

/** Fotos por vuelta. Bajo a propósito: esto corre junto al tráfico normal. */
const POR_VUELTA = 20;

/** Cuántas tareas a la vez. El watermark baja el original y usa sharp. */
const CONCURRENCIA = 2;

/**
 * Después de tantos intentos fallidos se deja de reintentar hasta el próximo
 * reinicio. Sin esto, una foto rota —el original borrado del bucket, por
 * ejemplo— se reintentaría cada cinco minutos para siempre.
 */
const MAX_INTENTOS = 3;

const intentos = new Map<string, number>();
let corriendo = false;
let timer: NodeJS.Timeout | null = null;

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
  if (corriendo) return;

  // Si el admin disparó un reprocesado, ese manda: no tiene sentido que los dos
  // peleen por el mismo ancho de banda y las mismas fotos.
  if (hayTrabajoCorriendo()) return;

  corriendo = true;
  try {
    const pendientes = await db.photo.findMany({
      where: { previewKey: null },
      // Las más nuevas primero: son las del evento que se está publicando, las
      // que alguien está esperando ver.
      orderBy: { createdAt: "desc" },
      select: { id: true, mimeType: true, filename: true, storageKey: true, previewKey: true },
      take: POR_VUELTA * 3,
    });

    const cola = pendientes
      .filter((p) => (intentos.get(p.id) ?? 0) < MAX_INTENTOS)
      .slice(0, POR_VUELTA);

    if (cola.length === 0) return;

    console.log(`[barrido] ${cola.length} fotos sin marca de agua`);

    const { runWatermark } = await import("~/lib/photo-processing");
    const { runVideoWatermark } = await import("~/lib/video-processing");

    let hechas = 0;
    let fallidas = 0;
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

    const rendidas = [...intentos.values()].filter((n) => n >= MAX_INTENTOS).length;
    console.log(
      `[barrido] listas ${hechas}, fallidas ${fallidas}` +
        (rendidas > 0 ? `, ${rendidas} descartadas tras ${MAX_INTENTOS} intentos` : ""),
    );
  } catch (err) {
    console.error("[barrido] la vuelta falló:", err);
  } finally {
    corriendo = false;
  }
}
