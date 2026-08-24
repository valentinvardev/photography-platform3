/**
 * Core processing functions called directly from the server (bulkAdd mutation).
 * No HTTP, no auth — pure server-side logic.
 *
 * Regla de este módulo: el original se baja UNA sola vez por foto y el buffer
 * se comparte entre OCR, watermark e indexado facial. Antes cada etapa hacía su
 * propia descarga (3 por foto, ~53 MB para una foto de 24 MP) y la compresión
 * para Rekognition se calculaba dos veces con idéntico resultado.
 */

import sharp from "sharp";
import {
  DetectTextCommand,
  IndexFacesCommand,
} from "@aws-sdk/client-rekognition";
import {
  billedCall,
  ensureCollection,
  rekognition,
  rekognitionCollectionId,
} from "~/lib/rekognition";
import { db } from "~/server/db";
import { getAdminClient } from "~/lib/supabase/admin";
import { WATERMARK_KEY } from "~/lib/watermark";
import { getS3ObjectBytes, putS3Object, deleteS3Objects, isS3Key, s3Key } from "~/lib/s3";

/** Tope de Rekognition para imágenes mandadas por `Bytes`. */
const REKOGNITION_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Caras a indexar por foto. En una foto de evento entran corredores y público,
 * así que el tope viejo de 10 se quedaba corto. Cada cara guardada se factura
 * por mes, y cuantas más caras de fondo haya, más chance de un match cruzado en
 * la búsqueda por selfie — por eso no está en el máximo de 100 que admite AWS.
 */
const MAX_FACES_POR_FOTO = 20;

// ── Storage backend helpers ───────────────────────────────────────────────────

async function downloadBytes(storageKey: string): Promise<Uint8Array | null> {
  if (isS3Key(storageKey)) {
    try {
      return await getS3ObjectBytes(storageKey);
    } catch (err) {
      console.error("[storage] S3 download failed:", storageKey, err);
      return null;
    }
  }
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from("photos").download(storageKey);
  if (error ?? !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * El original de una foto, bajado una sola vez, más la versión achicada que se
 * le manda a Rekognition. OCR e indexado facial mandan exactamente los mismos
 * bytes, así que la compresión se hace una vez y se reutiliza.
 */
export type PhotoBytes = {
  raw: Uint8Array;
  forRekognition: Uint8Array;
};

/**
 * Escalones para meter una foto bajo el límite de Rekognition perdiendo la
 * menor resolución posible. Se toma el primero que entra.
 *
 * Antes esto era un único paso a 1920 px, que en fotos de evento es demasiado:
 * un original de 6000 px se reducía 3,1× y una cara de 120 px quedaba en 38 —
 * por debajo de los ~40x40 px que Rekognition necesita para detectarla. De ahí
 * salían los `indexed 0 faces` y que la búsqueda por selfie no encontrara nada.
 * Bajar calidad cuesta mucho menos detección que bajar resolución.
 */
const ESCALONES_REKOGNITION: { width: number | null; quality: number }[] = [
  { width: null, quality: 80 },
  { width: 4096, quality: 80 },
  { width: 3000, quality: 75 },
  { width: 1920, quality: 80 },
];

export async function loadPhotoBytes(
  storageKey: string,
  label: string,
): Promise<PhotoBytes | null> {
  const raw = await downloadBytes(storageKey);
  if (!raw) {
    console.error(`[${label}] Download failed:`, storageKey);
    return null;
  }

  if (raw.byteLength <= REKOGNITION_MAX_BYTES) {
    return { raw, forRekognition: raw };
  }

  const source = Buffer.from(raw);
  let ultima: Buffer | null = null;

  for (const escalon of ESCALONES_REKOGNITION) {
    const pipeline = sharp(source);
    if (escalon.width) pipeline.resize({ width: escalon.width, withoutEnlargement: true });
    ultima = await pipeline.jpeg({ quality: escalon.quality }).toBuffer();

    if (ultima.byteLength <= REKOGNITION_MAX_BYTES) {
      console.log(
        `[${label}] Compressed ${raw.byteLength} → ${ultima.byteLength} bytes ` +
          `(${escalon.width ? `${escalon.width}px` : "resolución completa"}, q${escalon.quality})`,
      );
      return { raw, forRekognition: new Uint8Array(ultima) };
    }
  }

  // Ningún escalón entró. Se manda el más chico igual: si Rekognition lo
  // rechaza, el error queda logueado donde corresponde.
  console.warn(
    `[${label}] No se pudo bajar de ${REKOGNITION_MAX_BYTES} bytes: quedó en ${ultima!.byteLength}`,
  );
  return { raw, forRekognition: new Uint8Array(ultima!) };
}

// ── OCR ───────────────────────────────────────────────────────────────────────

function extractAllBibs(
  detections: Array<{ DetectedText?: string; Type?: string; Confidence?: number }>,
): string[] {
  const candidates: { value: string; score: number }[] = [];

  for (const d of detections) {
    if (d.Type !== "LINE") continue;
    const text = (d.DetectedText ?? "").trim();
    const confidence = d.Confidence ?? 0;
    if (confidence < 50) continue;

    const matches = text.match(/\b\d{2,5}\b/g) ?? [];
    for (const m of matches) {
      if (/^\d{1,2}:\d{2}/.test(text)) continue;
      if (text.includes("%")) continue;
      if (/^\d+\s*km$/i.test(text)) continue;
      if (parseInt(m) > 99999) continue;

      const len = m.length;
      const lenScore = len === 3 ? 4 : len === 4 ? 5 : len === 2 ? 3 : len === 5 ? 2 : 1;
      const isolatedBonus = text === m ? 3 : 0;
      const confBonus = confidence / 50;
      candidates.push({ value: m, score: lenScore + isolatedBonus + confBonus });
    }
  }

  if (candidates.length === 0) return [];

  const best = new Map<string, number>();
  for (const c of candidates) {
    if (!best.has(c.value) || best.get(c.value)! < c.score) best.set(c.value, c.score);
  }

  return Array.from(best.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v);
}

export async function runOcr(
  photoId: string,
  preloaded?: PhotoBytes,
): Promise<{ bib: string | null }> {
  const photo = await db.photo.findUnique({
    where: { id: photoId },
    select: { id: true, storageKey: true, bibNumber: true },
  });
  if (!photo) return { bib: null };
  if (photo.bibNumber !== null) return { bib: photo.bibNumber };

  const bytes = preloaded ?? (await loadPhotoBytes(photo.storageKey, "OCR"));
  if (!bytes) return { bib: null };

  try {
    const response = await billedCall("DetectText", photoId, () =>
      rekognition.send(new DetectTextCommand({ Image: { Bytes: bytes.forRekognition } })),
    );
    const bibs = extractAllBibs(response.TextDetections ?? []);

    console.log(`[OCR] photoId=${photoId} bibs=${bibs.join(",") || "none"}`);

    // Se marca el intento aunque no haya salido nada: es lo que evita que un
    // reprocesado vuelva a pagar OCR sobre fotos donde no hay dorsal visible.
    const bibString = bibs.length > 0 ? bibs.join(",") : null;
    await db.photo.update({
      where: { id: photoId },
      data: { ocrAttemptedAt: new Date(), ...(bibString ? { bibNumber: bibString } : {}) },
    });
    return { bib: bibString };
  } catch (err) {
    console.error(`[OCR] Rekognition error for photoId=${photoId}:`, err);
    return { bib: null };
  }
}

// ── Watermark ─────────────────────────────────────────────────────────────────

/**
 * El PNG del watermark se bajaba de S3 en cada foto. Es siempre el mismo
 * archivo: era un round trip por foto que no hacía falta.
 */
let wmCache: { buf: Buffer | null; expiresAt: number } | null = null;

/**
 * El watermark ya escalado y rotado para un tamaño de imagen dado. Las fotos de
 * una misma tanda comparten dimensiones, así que se calcula una vez por tamaño
 * en vez de re-escalar y re-rotar en cada foto.
 */
const compositeCache = new Map<string, Buffer>();
const COMPOSITE_CACHE_MAX = 32;

async function getWatermarkBytes(): Promise<Buffer | null> {
  const now = Date.now();
  if (wmCache && now < wmCache.expiresAt) return wmCache.buf;

  let buf: Buffer | null = null;
  try {
    buf = Buffer.from(await getS3ObjectBytes(s3Key(WATERMARK_KEY)));
  } catch {
    // Todavía no subieron un watermark. Se cachea el null igual, para no
    // reintentar la descarga en cada foto de la tanda.
  }
  wmCache = { buf, expiresAt: now + 10 * 60 * 1000 };
  return buf;
}

/** Invalida el caché. Llamar cuando el admin cambia el watermark. */
export function resetWatermarkCache(): void {
  wmCache = null;
  compositeCache.clear();
}

function fallbackComposite(): { input: Buffer; tile: boolean; blend: "over" } {
  const tileSize = 220;
  const half = tileSize / 2;
  const svg = [
    `<svg width="${tileSize}" height="${tileSize}" xmlns="http://www.w3.org/2000/svg">`,
    `<text x="${half}" y="${half}" text-anchor="middle" dominant-baseline="middle"`,
    ` font-family="Arial, sans-serif" font-size="22" font-weight="bold" letter-spacing="3"`,
    ` fill="rgba(255,255,255,0.38)"`,
    ` transform="rotate(-35, ${half}, ${half})">PREVIEW</text>`,
    `</svg>`,
  ].join("");
  return { input: Buffer.from(svg), tile: true, blend: "over" };
}

async function buildWatermarkComposite(
  imageWidth: number,
  imageHeight: number,
): Promise<{ input: Buffer; tile: boolean; blend: "over" }> {
  const wmPng = await getWatermarkBytes();
  if (!wmPng) return fallbackComposite();

  const meta = await sharp(wmPng).metadata();
  const wmW = meta.width ?? 300;
  const wmH = meta.height ?? 100;
  const targetW = Math.round(Math.min(imageWidth, imageHeight) * 0.40);
  const targetH = Math.round((wmH / wmW) * targetW);

  const cacheKey = `${targetW}x${targetH}`;
  const cached = compositeCache.get(cacheKey);
  if (cached) return { input: cached, tile: true, blend: "over" };

  const scaled = await sharp(wmPng)
    .resize(targetW, targetH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .rotate(-35, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  if (compositeCache.size >= COMPOSITE_CACHE_MAX) {
    const oldest = compositeCache.keys().next().value;
    if (oldest !== undefined) compositeCache.delete(oldest);
  }
  compositeCache.set(cacheKey, scaled);

  return { input: scaled, tile: true, blend: "over" };
}

export async function runWatermark(
  photoId: string,
  preloaded?: PhotoBytes,
): Promise<{ previewKey: string | null }> {
  const photo = await db.photo.findUnique({ where: { id: photoId } });
  if (!photo) return { previewKey: null };

  const useS3 = isS3Key(photo.storageKey);
  const bytes = preloaded ?? (await loadPhotoBytes(photo.storageKey, "Watermark"));
  if (!bytes) return { previewKey: null };

  const buffer = Buffer.from(bytes.raw);

  try {
    const supabase = getAdminClient();
    const PREVIEW_MAX_WIDTH = 1600;
    const PREVIEW_QUALITY = 65;

    // El resize devuelve las dimensiones de salida en `info`, así que no hace
    // falta una pasada aparte de metadata para saber a qué tamaño quedó.
    const { data: resizedBuffer, info } = await sharp(buffer)
      .resize({ width: PREVIEW_MAX_WIDTH, withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });

    const composite = await buildWatermarkComposite(info.width, info.height);
    const watermarked = await sharp(resizedBuffer)
      .composite([composite])
      .jpeg({ quality: PREVIEW_QUALITY, mozjpeg: true })
      .toBuffer();

    // Delete previous preview from the correct backend
    if (photo.previewKey) {
      if (isS3Key(photo.previewKey)) {
        await deleteS3Objects([photo.previewKey]);
      } else if (supabase) {
        await supabase.storage.from("photos").remove([photo.previewKey]);
      }
    }

    const previewKey = s3Key(`previews/${photo.id}.jpg`);

    if (useS3) {
      await putS3Object(previewKey, watermarked, "image/jpeg");
    } else {
      if (!supabase) { console.error("[Watermark] Supabase not available for preview upload"); return { previewKey: null }; }
      const { error: upError } = await supabase.storage
        .from("photos")
        .upload(previewKey, watermarked, { contentType: "image/jpeg", upsert: true });
      if (upError) { console.error("[Watermark] Upload failed:", upError); return { previewKey: null }; }
    }

    await db.photo.update({
      where: { id: photoId },
      data: { previewKey, previewGeneratedAt: new Date() },
    });
    console.log(`[Watermark] photoId=${photoId} done (${useS3 ? "s3" : "supabase"})`);
    return { previewKey };
  } catch (err) {
    console.error(`[Watermark] Error for photoId=${photoId}:`, err);
    return { previewKey: null };
  }
}

// ── Face index ────────────────────────────────────────────────────────────────

export async function runFaceIndex(
  photoId: string,
  collectionId: string,
  preloaded?: PhotoBytes,
): Promise<void> {
  const photo = await db.photo.findUnique({
    where: { id: photoId },
    select: { id: true, storageKey: true },
  });
  if (!photo) return;

  // Idempotencia: si esta foto ya tiene caras indexadas, volver a llamar a
  // IndexFaces se paga de nuevo Y duplica las caras en la colección (cada
  // llamada devuelve FaceIds nuevos, así que el upsert por rekFaceId no
  // deduplica nada). La guarda de esas caras se factura por mes para siempre.
  const alreadyIndexed = await db.faceRecord.findFirst({
    where: { photoId },
    select: { id: true },
  });
  if (alreadyIndexed) {
    console.log(`[FaceIndex] photoId=${photoId} ya indexada — se omite`);
    return;
  }

  const bytes = preloaded ?? (await loadPhotoBytes(photo.storageKey, "FaceIndex"));
  if (!bytes) return;

  const rekCollectionId = rekognitionCollectionId(collectionId);

  try {
    await ensureCollection(rekCollectionId);
    const result = await billedCall("IndexFaces", photoId, () =>
      rekognition.send(new IndexFacesCommand({
        CollectionId: rekCollectionId,
        Image: { Bytes: bytes.forRekognition },
        ExternalImageId: photoId,
        DetectionAttributes: [],
        MaxFaces: MAX_FACES_POR_FOTO,
        // Sin esto Rekognition usa QualityFilter "AUTO", que descarta caras
        // chicas o poco nítidas ANTES de indexarlas. Medido sobre fotos reales
        // de downhill: de 8 caras detectadas con confianza 88-100, AUTO tiraba
        // 5 por SMALL_BOUNDING_BOX y LOW_SHARPNESS. Son justo las de quien está
        // lejos o en movimiento, que es medio evento deportivo.
        QualityFilter: "NONE",
      })),
    );

    const indexed = result.FaceRecords ?? [];
    const descartadas = result.UnindexedFaces ?? [];
    // Se loguean las dos: contar sólo las indexadas hacía invisible el filtro.
    console.log(
      `[FaceIndex] photoId=${photoId} indexed ${indexed.length} faces` +
        (descartadas.length ? `, descartadas ${descartadas.length}` : ""),
    );

    // Se marca el intento aunque no haya salido ninguna cara. Sin esto, una
    // foto donde no hay rostro detectable queda para siempre en la cola de
    // "pendientes" y cada reprocesado la vuelve a pagar.
    await db.photo.update({
      where: { id: photoId },
      data: { faceAttemptedAt: new Date() },
    });

    for (const fr of indexed) {
      const faceId = fr.Face?.FaceId;
      if (!faceId) continue;
      await db.faceRecord.upsert({
        where: { rekFaceId: faceId },
        update: { photoId, collectionId, confidence: fr.Face?.Confidence ?? null },
        create: { rekFaceId: faceId, photoId, collectionId, confidence: fr.Face?.Confidence ?? null },
      });
    }
  } catch (err) {
    console.error(`[FaceIndex] Error for photoId=${photoId}:`, err);
  }
}

// ── Orquestación ──────────────────────────────────────────────────────────────

/**
 * Procesa una foto entera con una sola descarga del original.
 * Las tres etapas van en paralelo: OCR e indexado son llamadas a AWS y el
 * watermark es CPU más subida, así que se solapan bien.
 */
export async function processPhoto(photoId: string, collectionId: string): Promise<void> {
  const photo = await db.photo.findUnique({
    where: { id: photoId },
    select: { storageKey: true },
  });
  if (!photo) return;

  const bytes = await loadPhotoBytes(photo.storageKey, "process");
  if (!bytes) return;

  const started = Date.now();
  await Promise.allSettled([
    runOcr(photoId, bytes),
    runWatermark(photoId, bytes),
    runFaceIndex(photoId, collectionId, bytes),
  ]);
  console.log(`[process] photoId=${photoId} listo en ${Date.now() - started} ms`);
}

/**
 * Procesa un lote con un techo de tareas simultáneas.
 *
 * Antes esto era un loop con `await setTimeout(i * 400)`. Al ser acumulativo,
 * una tanda de 10 sumaba 18 s de espera pura (400 × 45) y aun así no ponía
 * ningún techo real: cada subida lanzaba su propio loop y todos se solapaban
 * sin límite. Un pool acotado ordena eso sin frenar de más.
 */
export async function processPhotoBatch(
  photos: { id: string; isVideo: boolean }[],
  collectionId: string,
  concurrency = 3,
): Promise<void> {
  const { runVideoWatermark } = await import("~/lib/video-processing");

  let next = 0;
  const worker = async () => {
    while (next < photos.length) {
      const item = photos[next++]!;
      try {
        if (item.isVideo) await runVideoWatermark(item.id);
        else await processPhoto(item.id, collectionId);
      } catch (err) {
        console.error(`[process] photoId=${item.id} falló:`, err);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, photos.length) }, worker),
  );
}
