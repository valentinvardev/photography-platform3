import { type NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { isVideoMimeType } from "~/lib/video-utils";

/**
 * Reprocesa trabajo pendiente de una colección.
 *
 * Dos decisiones de diseño, las dos por lo mismo — que no salga caro ni lento:
 *
 * 1. Sólo toca fotos que le falta ese trabajo. Nunca rehace lo ya hecho.
 *    Reindexar una foto ya indexada se paga de nuevo Y duplica las caras.
 *
 * 2. Procesa un lote por request, del lado del servidor y con concurrencia.
 *    El regenerador viejo hacía un request HTTP por foto desde el browser,
 *    en serie: para 2.000 fotos eran 2.000 viajes encadenados, y se cortaba
 *    al cerrar la pestaña. El cliente ahora llama en loop hasta que
 *    `pending` llega a 0, así cada request es corto y hay progreso real.
 */

/**
 * Techo de fotos por request. Bajo a propósito: cada foto puede pesar 15 MB y
 * hay que bajarla antes de procesarla.
 */
const BATCH = 12;

/**
 * Techo de tiempo por request, para que la respuesta llegue antes de que la
 * corte el proxy.
 *
 * Es un techo blando: se chequea ANTES de tomar cada foto, así que en el peor
 * caso el request dura esto más lo que tarde la última tanda en curso. Con
 * llamadas a Rekognition de ~2 s eso da margen de sobra; se bajó de 20 s
 * cuando en producción las llamadas tardaban ~11 s y el proxy devolvía 504
 * aunque el servidor terminara el trabajo.
 */
const PRESUPUESTO_MS = 12_000;

export type ReprocessKind = "ocr" | "ocr-retry" | "faces" | "watermark";

/**
 * Qué le falta a cada foto.
 *
 * Para OCR y rostros el filtro es "nunca se intentó", no "no tiene resultado":
 * la mayoría de las fotos no tiene un dorsal visible, y muchas no tienen ningún
 * rostro detectable. Filtrar por resultado las dejaría en la cola para siempre
 * y cada pasada las volvería a pagar.
 */
function pendingFilter(kind: ReprocessKind) {
  switch (kind) {
    case "ocr":
      return { ocrAttemptedAt: null };
    case "ocr-retry":
      // La excepción deliberada: acá SÍ se reprocesa lo ya intentado. Es una
      // acción aparte, que el admin elige a mano, porque vuelve a pagar OCR
      // sobre fotos donde ya se buscó dorsal y no apareció.
      return { bibNumber: null };
    case "faces":
      return { faceAttemptedAt: null };
    case "watermark":
      return { previewKey: null };
  }
}

/** Mensaje corto y útil de un error desconocido. */
function mensajeDeError(err: unknown): string {
  if (err instanceof Error) {
    // Prisma pone el detalle que importa en la primera línea con contenido.
    const primera = err.message
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    return (primera ?? err.message).slice(0, 300);
  }
  return String(err).slice(0, 300);
}

export async function POST(req: NextRequest) {
  try {
    return await procesar(req);
  } catch (err) {
    // Sin esto, cualquier excepción salía como un 500 sin cuerpo y el panel
    // sólo podía decir "Falló". El caso típico: se desplegó el código antes de
    // correr `db push` y Prisma no encuentra una columna.
    const detalle = mensajeDeError(err);
    console.error("[reprocess] error no controlado:", err);
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}

async function procesar(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collectionId, kind, desdeOrden } = (await req.json()) as {
    collectionId?: string;
    kind?: ReprocessKind;
    desdeOrden?: number;
  };

  if (!collectionId || !kind || !["ocr", "ocr-retry", "faces", "watermark"].includes(kind)) {
    return NextResponse.json({ error: "collectionId y kind son requeridos" }, { status: 400 });
  }

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true },
  });
  if (!collection) {
    return NextResponse.json({ error: "Colección no encontrada" }, { status: 404 });
  }

  const where = { collectionId, ...pendingFilter(kind) };

  // Cursor sobre `order`, no paginado por offset. Es lo que hace que cada
  // pasada avance siempre: hay fotos que nunca salen del filtro —una sin dorsal
  // visible sigue con bibNumber null por más veces que se la procese— y sin
  // cursor el lote traería las mismas doce para siempre, pagándolas cada vuelta.
  const batch = await db.photo.findMany({
    where: {
      ...where,
      ...(typeof desdeOrden === "number" ? { order: { gt: desdeOrden } } : {}),
    },
    select: { id: true, mimeType: true, filename: true, order: true },
    orderBy: { order: "asc" },
    take: BATCH,
  });

  if (batch.length === 0) {
    const restantes = await db.photo.count({ where });
    return NextResponse.json({
      processed: 0,
      pending: restantes,
      failed: 0,
      agotado: true,
      ultimoOrden: desdeOrden ?? null,
    });
  }

  const { runOcr, runFaceIndex, runWatermark, loadPhotoBytes } = await import(
    "~/lib/photo-processing"
  );
  const { runVideoWatermark } = await import("~/lib/video-processing");

  let processed = 0;
  let failed = 0;
  /** Muestra de errores, para que el panel pueda decir qué pasó. */
  const errores: string[] = [];
  const anotar = (photoId: string, motivo: string) => {
    failed++;
    if (errores.length < 3) errores.push(`${photoId.slice(-6)}: ${motivo}`);
  };

  // Pool acotado. El watermark es CPU (sharp), OCR e indexado son llamadas a
  // AWS, así que el watermark aguanta menos tareas simultáneas.
  const concurrency = kind === "watermark" ? 2 : 3;
  let next = 0;
  const inicio = Date.now();

  /** Hasta dónde llegó la pasada; el cliente lo devuelve en el request siguiente. */
  let ultimoOrden = desdeOrden ?? null;

  const worker = async () => {
    while (next < batch.length) {
      if (Date.now() - inicio > PRESUPUESTO_MS) break;
      const photo = batch[next++]!;
      // El cursor avanza aunque la foto falle o se saltee: reintentarla en la
      // vuelta siguiente sería volver a pagar el mismo fallo.
      if (ultimoOrden === null || photo.order > ultimoOrden) ultimoOrden = photo.order;
      const isVideo =
        isVideoMimeType(photo.mimeType) ||
        /\.(mp4|mov|webm|mkv|m4v)$/i.test(photo.filename);

      try {
        if (kind === "watermark") {
          // runWatermark no lanza cuando no puede: devuelve previewKey null.
          // Si eso contara como procesada, la cola nunca bajaría y el fallo
          // quedaría invisible.
          const { previewKey } = isVideo
            ? await runVideoWatermark(photo.id)
            : await runWatermark(photo.id);
          if (!previewKey) {
            anotar(photo.id, "no se pudo generar el preview (ver logs)");
            continue;
          }
        } else if (isVideo) {
          // Los videos no van a Rekognition: no hay nada que reconocer y se
          // pagaría igual. Se saltean sin contarlos como error.
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
        processed++;
      } catch (err) {
        anotar(photo.id, mensajeDeError(err));
        console.error(`[reprocess:${kind}] photoId=${photo.id} falló:`, err);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, batch.length) }, worker),
  );

  const pending = await db.photo.count({ where });

  console.log(
    `[reprocess:${kind}] collectionId=${collectionId} procesadas=${processed} fallidas=${failed} pendientes=${pending}` +
      (errores.length ? ` errores=${JSON.stringify(errores)}` : ""),
  );

  return NextResponse.json({
    processed,
    pending,
    failed,
    errores,
    ultimoOrden,
    // Se agotó el barrido si el lote no vino lleno: no hay más fotos después
    // del cursor.
    agotado: batch.length < BATCH,
  });
}
