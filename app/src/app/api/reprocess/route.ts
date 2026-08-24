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

/** Fotos por request. Suficiente para amortizar, corto para no timeoutear. */
const BATCH = 40;

export type ReprocessKind = "ocr" | "faces" | "watermark";

/** Qué le falta a cada foto, por tipo de trabajo. */
function pendingFilter(kind: ReprocessKind) {
  switch (kind) {
    case "ocr":
      // Nunca se intentó. No alcanza con "no tiene dorsal": la mayoría de las
      // fotos no tiene un dorsal visible y ya se procesaron bien.
      return { ocrAttemptedAt: null };
    case "faces":
      return { faceRecords: { none: {} } };
    case "watermark":
      return { previewKey: null };
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collectionId, kind } = (await req.json()) as {
    collectionId?: string;
    kind?: ReprocessKind;
  };

  if (!collectionId || !kind || !["ocr", "faces", "watermark"].includes(kind)) {
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

  const batch = await db.photo.findMany({
    where,
    select: { id: true, mimeType: true, filename: true },
    orderBy: { order: "asc" },
    take: BATCH,
  });

  if (batch.length === 0) {
    return NextResponse.json({ processed: 0, pending: 0, failed: 0 });
  }

  const { runOcr, runFaceIndex, runWatermark, loadPhotoBytes } = await import(
    "~/lib/photo-processing"
  );
  const { runVideoWatermark } = await import("~/lib/video-processing");

  let processed = 0;
  let failed = 0;

  // Pool acotado. El watermark es CPU (sharp), OCR e indexado son llamadas a
  // AWS, así que el watermark aguanta menos tareas simultáneas.
  const concurrency = kind === "watermark" ? 2 : 4;
  let next = 0;

  const worker = async () => {
    while (next < batch.length) {
      const photo = batch[next++]!;
      const isVideo =
        isVideoMimeType(photo.mimeType) ||
        /\.(mp4|mov|webm|mkv|m4v)$/i.test(photo.filename);

      try {
        if (kind === "watermark") {
          if (isVideo) await runVideoWatermark(photo.id);
          else await runWatermark(photo.id);
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
          if (!bytes) { failed++; continue; }

          if (kind === "ocr") await runOcr(photo.id, bytes);
          else await runFaceIndex(photo.id, collectionId, bytes);
        }
        processed++;
      } catch (err) {
        failed++;
        console.error(`[reprocess:${kind}] photoId=${photo.id} falló:`, err);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, batch.length) }, worker),
  );

  const pending = await db.photo.count({ where });

  console.log(
    `[reprocess:${kind}] collectionId=${collectionId} procesadas=${processed} fallidas=${failed} pendientes=${pending}`,
  );

  return NextResponse.json({ processed, pending, failed });
}
