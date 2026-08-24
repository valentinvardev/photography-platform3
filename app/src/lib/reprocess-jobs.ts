/**
 * Trabajos de reprocesado, en segundo plano.
 *
 * Por qué existe: hacer el trabajo dentro del request HTTP no funciona. Las
 * llamadas a Rekognition tardan segundos, el proxy corta la respuesta a los
 * ~30 s, y el cliente aborta al primer 504 — aunque el servidor haya terminado
 * el lote. Con 740 fotos pendientes eso avanzaba de a dos por click.
 *
 * La subida ya funcionaba bien justamente porque procesa en segundo plano y sin
 * plazo. Acá se hace lo mismo: el POST arranca el trabajo y contesta al
 * instante, y el cliente pregunta cómo va cada par de segundos.
 *
 * El estado vive en memoria del proceso. Si se reinicia, se pierde el progreso
 * mostrado —no el trabajo, que ya está en la base— y se puede volver a arrancar.
 * Asume un solo proceso: con pm2 en modo cluster habría que moverlo a la base.
 */

import { db } from "~/server/db";
import { isVideoMimeType } from "~/lib/video-utils";

export type ReprocessKind = "ocr" | "ocr-retry" | "faces" | "watermark";

export type EstadoTrabajo = {
  kind: ReprocessKind;
  collectionId: string;
  procesadas: number;
  fallidas: number;
  pendientes: number;
  errores: string[];
  corriendo: boolean;
  /** Motivo por el que se cortó, si se cortó mal. */
  error: string | null;
  arrancado: number;
  actualizado: number;
};

const trabajos = new Map<string, EstadoTrabajo>();

const clave = (collectionId: string, kind: ReprocessKind) => `${collectionId}:${kind}`;

/**
 * Qué le falta a cada foto.
 *
 * Para OCR y rostros el filtro es "nunca se intentó", no "no tiene resultado":
 * la mayoría de las fotos no tiene un dorsal visible, y muchas no tienen ningún
 * rostro detectable. Filtrar por resultado las dejaría en la cola para siempre
 * y cada pasada las volvería a pagar.
 */
export function pendingFilter(kind: ReprocessKind) {
  switch (kind) {
    case "ocr":
      return { ocrAttemptedAt: null };
    case "ocr-retry":
      // La excepción deliberada: acá SÍ se reprocesa lo ya intentado. Es una
      // acción aparte, que el admin elige a mano.
      return { bibNumber: null };
    case "faces":
      return { faceAttemptedAt: null };
    case "watermark":
      return { previewKey: null };
  }
}

/** Mensaje corto y útil de un error desconocido. */
export function mensajeDeError(err: unknown): string {
  if (err instanceof Error) {
    const primera = err.message
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    return (primera ?? err.message).slice(0, 300);
  }
  return String(err).slice(0, 300);
}

export function estadoDe(collectionId: string, kind: ReprocessKind): EstadoTrabajo | null {
  return trabajos.get(clave(collectionId, kind)) ?? null;
}

/** Cuántas fotos por vuelta se traen de la base. */
const LOTE = 25;

/**
 * Arranca el trabajo si no está corriendo ya. Devuelve el estado al instante:
 * el procesamiento sigue por su cuenta después de que este request contestó.
 */
export function arrancar(collectionId: string, kind: ReprocessKind): EstadoTrabajo {
  const k = clave(collectionId, kind);
  const existente = trabajos.get(k);
  if (existente?.corriendo) return existente;

  const estado: EstadoTrabajo = {
    kind,
    collectionId,
    procesadas: 0,
    fallidas: 0,
    pendientes: existente?.pendientes ?? 0,
    errores: [],
    corriendo: true,
    error: null,
    arrancado: Date.now(),
    actualizado: Date.now(),
  };
  trabajos.set(k, estado);

  void correr(estado).catch((err) => {
    estado.error = mensajeDeError(err);
    estado.corriendo = false;
    estado.actualizado = Date.now();
    console.error(`[reprocess:${kind}] el trabajo murió:`, err);
  });

  return estado;
}

/** Pide que el trabajo se detenga en la vuelta siguiente. */
export function detener(collectionId: string, kind: ReprocessKind): void {
  const e = trabajos.get(clave(collectionId, kind));
  if (e) e.corriendo = false;
}

async function correr(estado: EstadoTrabajo): Promise<void> {
  const { collectionId, kind } = estado;
  const where = { collectionId, ...pendingFilter(kind) };

  const { runOcr, runFaceIndex, runWatermark, loadPhotoBytes } = await import(
    "~/lib/photo-processing"
  );
  const { runVideoWatermark } = await import("~/lib/video-processing");

  estado.pendientes = await db.photo.count({ where });

  const anotar = (photoId: string, motivo: string) => {
    estado.fallidas++;
    if (estado.errores.length < 5) estado.errores.push(`${photoId.slice(-6)}: ${motivo}`);
  };

  // Cursor sobre `order`: hay fotos que nunca salen del filtro —una sin dorsal
  // visible sigue con bibNumber null por más veces que se la procese— así que
  // paginar por "las primeras N pendientes" repetiría las mismas para siempre.
  let desdeOrden: number | null = null;

  for (;;) {
    if (!estado.corriendo) break;

    const lote = await db.photo.findMany({
      where: {
        ...where,
        ...(desdeOrden !== null ? { order: { gt: desdeOrden } } : {}),
      },
      select: { id: true, mimeType: true, filename: true, order: true },
      orderBy: { order: "asc" },
      take: LOTE,
    });
    if (lote.length === 0) break;

    // El watermark es CPU (sharp); OCR e indexado son llamadas a AWS.
    const concurrency = kind === "watermark" ? 2 : 3;
    let next = 0;

    const worker = async () => {
      while (next < lote.length && estado.corriendo) {
        const photo = lote[next++]!;
        // El cursor avanza aunque falle: reintentar en la misma corrida sería
        // volver a pagar el mismo error.
        if (desdeOrden === null || photo.order > desdeOrden) desdeOrden = photo.order;

        const isVideo =
          isVideoMimeType(photo.mimeType) ||
          /\.(mp4|mov|webm|mkv|m4v)$/i.test(photo.filename);

        try {
          if (kind === "watermark") {
            // runWatermark no lanza cuando no puede: devuelve previewKey null.
            const { previewKey } = isVideo
              ? await runVideoWatermark(photo.id)
              : await runWatermark(photo.id);
            if (!previewKey) {
              anotar(photo.id, "no se pudo generar el preview (ver logs)");
              continue;
            }
          } else if (isVideo) {
            // Los videos no van a Rekognition: no hay nada que reconocer y se
            // pagaría igual.
            continue;
          } else {
            const record = await db.photo.findUnique({
              where: { id: photo.id },
              select: { storageKey: true },
            });
            if (!record) continue;
            const bytes = await loadPhotoBytes(record.storageKey, kind);
            if (!bytes) {
              anotar(photo.id, "no se pudo descargar el original");
              continue;
            }
            if (kind === "ocr" || kind === "ocr-retry") await runOcr(photo.id, bytes);
            else await runFaceIndex(photo.id, collectionId, bytes);
          }
          estado.procesadas++;
        } catch (err) {
          anotar(photo.id, mensajeDeError(err));
          console.error(`[reprocess:${kind}] photoId=${photo.id} falló:`, err);
        } finally {
          estado.actualizado = Date.now();
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, lote.length) }, worker),
    );

    estado.pendientes = await db.photo.count({ where });
    estado.actualizado = Date.now();
    console.log(
      `[reprocess:${kind}] ${collectionId} procesadas=${estado.procesadas} ` +
        `fallidas=${estado.fallidas} pendientes=${estado.pendientes}`,
    );
  }

  estado.corriendo = false;
  estado.actualizado = Date.now();
  console.log(
    `[reprocess:${kind}] ${collectionId} TERMINADO — procesadas=${estado.procesadas} ` +
      `fallidas=${estado.fallidas} pendientes=${estado.pendientes}`,
  );
}
