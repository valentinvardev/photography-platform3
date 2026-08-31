/**
 * Core processing functions called directly from the server (bulkAdd mutation).
 * No HTTP, no auth — pure server-side logic.
 *
 * Regla de este módulo: la imagen no viaja si no hace falta. OCR e indexado
 * facial le pasan a Rekognition la referencia en S3 y AWS lee el archivo por su
 * cuenta, así que no descargan nada. La marca de agua es la única que necesita
 * los píxeles en el servidor, porque sharp trabaja sobre ellos.
 *
 * Antes las tres bajaban el original —a veces cada una por su lado— y desde
 * este servidor eso son segundos por transferencia.
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
import { getS3ObjectBytes, putS3Object, deleteS3Objects, isS3Key, s3Key, S3_BUCKET, getCFUrl, headS3Object } from "~/lib/s3";
import type { Image } from "@aws-sdk/client-rekognition";

/**
 * libvips usa 16 hilos por operación por defecto. Con varias fotos procesándose
 * en paralelo eso son decenas de hilos peleando por los pocos núcleos del VPS.
 * El paralelismo lo maneja el pool de trabajos, así que cada operación va con
 * un hilo y no se pisan.
 */
sharp.concurrency(1);

/**
 * Cómo se le pasa la imagen a Rekognition.
 *
 * Si está en S3, se le pasa la referencia y AWS la lee por su cuenta: no baja
 * nada al servidor ni vuelve a subirlo. El camino viejo —bajar 4,4 MB de S3 y
 * subírselos a Rekognition— pagaba dos transferencias grandes por foto, y
 * medido desde el VPS eran ~11 s cada una. Además el límite sube de 5 MB a
 * 15 MB, así que no hace falta comprimir nada.
 *
 * El bucket tiene que estar en la misma región que Rekognition: acá lo están,
 * los dos clientes usan AWS_REGION.
 *
 * Sólo se cae a `Bytes` para lo que quedó en Supabase, donde no hay referencia
 * que AWS pueda seguir.
 */
async function conImagen<T>(
  storageKey: string,
  label: string,
  respaldo: PhotoBytes | null,
  ejecutar: (imagen: Image) => Promise<T>,
): Promise<T | null> {
  if (isS3Key(storageKey)) {
    try {
      return await ejecutar({ S3Object: { Bucket: S3_BUCKET, Name: storageKey } });
    } catch (err) {
      const name = (err as { name?: string }).name;
      // Si AWS no puede leer el objeto —bucket en otra región, permisos— se
      // cae a mandar los bytes. Cuesta dos transferencias, pero funciona.
      // No pude verificar la región del bucket desde acá (falta
      // s3:GetBucketLocation), así que esta red se queda.
      if (name !== "InvalidS3ObjectException" && name !== "AccessDeniedException") throw err;
      console.warn(`[${label}] S3Object rechazado (${name}) — reintentando con bytes`);
    }
  }

  const bytes = respaldo ?? (await loadPhotoBytes(storageKey, label));
  if (!bytes) return null;
  return ejecutar({ Bytes: bytes.forRekognition });
}

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

/**
 * Tope para bajar una foto. Sin esto un socket que deja de avanzar cuelga al
 * worker para siempre, y con varios workers el trabajo entero se congela sin
 * un solo mensaje de error — que es exactamente lo que pasaba con la marca de
 * agua mientras OCR y rostros ya andaban.
 */
const DESCARGA_TIMEOUT_MS = 45_000;

function conTope<T>(promesa: Promise<T>, ms: number, que: string): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<never>((_, rechazar) =>
      setTimeout(() => rechazar(new Error(`${que} superó ${ms}ms`)), ms),
    ),
  ]);
}

async function downloadBytes(storageKey: string): Promise<Uint8Array | null> {
  if (isS3Key(storageKey)) {
    // Primero CloudFront: tiene edges en Sudamérica y el bucket está en
    // us-east-2. Bajar de S3 directo desde este VPS se colgaba; es la misma
    // distribución que ya sirve la galería, así que no hay nada nuevo que
    // configurar.
    const cf = getCFUrl(storageKey);
    if (cf) {
      try {
        const r = await fetch(cf, { signal: AbortSignal.timeout(DESCARGA_TIMEOUT_MS) });
        if (r.ok) return new Uint8Array(await r.arrayBuffer());
        console.warn(`[storage] CloudFront ${r.status} para ${storageKey}`);
      } catch (err) {
        console.warn(`[storage] CloudFront falló para ${storageKey}:`, (err as Error).name);
      }
    }

    try {
      return await conTope(getS3ObjectBytes(storageKey), DESCARGA_TIMEOUT_MS, "descarga S3");
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
 * Peso al que apuntamos para mandar a Rekognition.
 *
 * No es un límite de la API —ese es REKOGNITION_MAX_BYTES— sino de velocidad.
 * Medido en producción: mandar 4,4 MB desde el VPS hasta la región de AWS daba
 * ~11 s por llamada, y el request moría contra el proxy antes de responder.
 * Casi todo ese tiempo es subir los bytes.
 */
const REKOGNITION_TARGET_BYTES = 1_500_000;

/**
 * Escalones para achicar. El orden importa y no es casual: primero se baja
 * CALIDAD a resolución completa, y sólo al final se toca la resolución.
 *
 * Son dos cosas distintas. La resolución define si Rekognition llega a detectar
 * algo: una cara de 120 px sobrevive, una de 38 no, y un dorsal es texto chico.
 * El peso define cuánto tarda en llegar. Se puede bajar mucho el peso con
 * calidad JPEG sin perder casi nada de detección, así que eso es lo primero.
 */
const ESCALONES_REKOGNITION: { width: number | null; quality: number }[] = [
  { width: null, quality: 72 },
  { width: null, quality: 58 },
  { width: 2400, quality: 65 },
  { width: 1600, quality: 70 },
];

export async function loadPhotoBytes(
  storageKey: string,
  label: string,
): Promise<PhotoBytes | null> {
  // Cronometrado por etapa: sin esto no se puede distinguir "colgado" de
  // "lento", ni saber si el cuello está en la red o en el CPU.
  const t0 = Date.now();
  const raw = await downloadBytes(storageKey);
  const msBajada = Date.now() - t0;
  if (!raw) {
    console.error(`[${label}] Download failed en ${msBajada}ms:`, storageKey);
    return null;
  }
  console.log(
    `[${label}] bajada ${(raw.byteLength / 1e6).toFixed(1)}MB en ${msBajada}ms`,
  );

  // Ya es liviana: mandarla tal cual y evitarse el re-encode.
  if (raw.byteLength <= REKOGNITION_TARGET_BYTES) {
    return { raw, forRekognition: raw };
  }

  const source = Buffer.from(raw);
  let ultima: Buffer | null = null;
  const tc = Date.now();

  for (const escalon of ESCALONES_REKOGNITION) {
    const pipeline = sharp(source);
    if (escalon.width) pipeline.resize({ width: escalon.width, withoutEnlargement: true });
    ultima = await pipeline.jpeg({ quality: escalon.quality }).toBuffer();

    if (ultima.byteLength <= REKOGNITION_TARGET_BYTES) {
      console.log(
        `[${label}] comprimida a ${(ultima.byteLength / 1e6).toFixed(2)}MB en ${Date.now() - tc}ms ` +
          `(${escalon.width ? `${escalon.width}px` : "resolución completa"}, q${escalon.quality})`,
      );
      return { raw, forRekognition: new Uint8Array(ultima) };
    }
  }

  // Ningún escalón llegó al objetivo de velocidad. Mientras entre en el límite
  // duro de la API alcanza; sólo tarda más de lo que nos gustaría.
  const nivel = ultima!.byteLength <= REKOGNITION_MAX_BYTES ? console.log : console.warn;
  nivel(
    `[${label}] ${(raw.byteLength / 1e6).toFixed(1)}MB → ${(ultima!.byteLength / 1e6).toFixed(2)}MB ` +
      `(no llegó al objetivo de ${(REKOGNITION_TARGET_BYTES / 1e6).toFixed(1)}MB)`,
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

  try {
    const response = await conImagen(photo.storageKey, "OCR", preloaded ?? null, (imagen) =>
      billedCall("DetectText", photoId, () =>
        rekognition.send(new DetectTextCommand({ Image: imagen })),
      ),
    );
    if (!response) return { bib: null };
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
/**
 * "ausente" y "error" son estados distintos a propósito, porque piden lo
 * contrario uno del otro:
 * - ausente: no hay watermark subido (NoSuchKey). Legítimo — la plataforma
 *   eligió no usar marca — y corresponde el texto de respaldo.
 * - error: hay (o puede haber) una marca pero no se pudo traer. Publicar la
 *   foto con el respaldo acá sería sacarla a la galería SIN la marca real y
 *   marcarla terminada para siempre: nadie la reintentaría. Corresponde fallar
 *   la foto y que el barrido la reintente cuando la red vuelva.
 */
type EstadoWatermark =
  | { estado: "ok"; buf: Buffer }
  | { estado: "ausente" }
  | { estado: "error" };

let wmCache: { valor: EstadoWatermark; expiresAt: number } | null = null;

/**
 * El watermark ya escalado y rotado para un tamaño de imagen dado. Las fotos de
 * una misma tanda comparten dimensiones, así que se calcula una vez por tamaño
 * en vez de re-escalar y re-rotar en cada foto.
 */
const compositeCache = new Map<string, Buffer>();
const COMPOSITE_CACHE_MAX = 32;

async function getWatermarkBytes(): Promise<EstadoWatermark> {
  const now = Date.now();
  if (wmCache && now < wmCache.expiresAt) return wmCache.valor;

  const key = s3Key(WATERMARK_KEY);

  // Primero se pregunta si el PNG EXISTE, con una llamada barata, para poder
  // separar "no hay marca configurada" de "no la pude traer". Después la
  // descarga va por downloadBytes (CloudFront + tope de tiempo).
  let valor: EstadoWatermark;
  try {
    const head = await headS3Object(key);
    if (head === "no-existe") {
      valor = { estado: "ausente" };
    } else if (head === "error") {
      valor = { estado: "error" };
    } else {
      const bytes = await downloadBytes(key);
      valor = bytes ? { estado: "ok", buf: Buffer.from(bytes) } : { estado: "error" };
    }
  } catch {
    valor = { estado: "error" };
  }

  // El éxito y la ausencia se cachean 10 min; el error, 15 s. Un error no
  // puede quedarse cacheado mucho tiempo: mientras dure, las fotos fallan (a
  // propósito, para no publicarlas sin marca) y conviene salir de ahí rápido.
  if (valor.estado === "error") {
    console.warn("[Watermark] no se pudo traer el PNG de la marca — las fotos esperan al reintento");
    wmCache = { valor, expiresAt: now + 15_000 };
  } else {
    wmCache = { valor, expiresAt: now + 10 * 60 * 1000 };
  }
  return valor;
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

/**
 * Devuelve null cuando la marca existe pero no se pudo traer: la foto tiene que
 * FALLAR y reintentarse, no salir a la galería con el respaldo translúcido y
 * quedar marcada como terminada. Eso pasó de verdad: fotos publicadas "sin
 * marca" que el sistema daba por buenas y nunca reintentaba.
 */
async function buildWatermarkComposite(
  imageWidth: number,
  imageHeight: number,
): Promise<{ input: Buffer; tile: boolean; blend: "over" } | null> {
  const wm = await getWatermarkBytes();
  if (wm.estado === "error") return null;
  if (wm.estado === "ausente") return fallbackComposite();
  const wmPng = wm.buf;

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

/** Lo mínimo que necesita runWatermark para trabajar sin volver a la base. */
export type FotoParaWatermark = {
  id: string;
  storageKey: string;
  previewKey: string | null;
};

export async function runWatermark(
  photoId: string,
  opciones?: { preloaded?: PhotoBytes; foto?: FotoParaWatermark },
): Promise<{ previewKey: string | null }> {
  const { preloaded, foto } = opciones ?? {};

  // Quien ya tiene el registro lo pasa y se ahorra una consulta. En este VPS
  // cada ida a la base cuesta ~1 s, más que todo el trabajo de imagen: el
  // trabajo de reprocesado ya traía estos datos en el lote y volvía a pedirlos.
  const photo = foto ?? (await db.photo.findUnique({
    where: { id: photoId },
    select: { id: true, storageKey: true, previewKey: true },
  }));
  if (!photo) return { previewKey: null };

  const useS3 = isS3Key(photo.storageKey);

  // Descarga cruda a propósito, sin pasar por loadPhotoBytes: ese además arma
  // la variante comprimida para Rekognition —un decode+encode completo de
  // sharp— que la marca de agua no usa para nada. Era trabajo puro al pedo en
  // cada foto. El original hace falta entero: sharp necesita los bytes acá, y
  // por eso esta es la única etapa que sigue bajando la foto al servidor.
  const t0 = Date.now();
  const raw = preloaded?.raw ?? (await downloadBytes(photo.storageKey));
  if (!raw) {
    console.error(`[Watermark] no se pudo bajar ${photo.storageKey}`);
    return { previewKey: null };
  }
  if (!preloaded) {
    console.log(
      `[Watermark] bajada ${(raw.byteLength / 1e6).toFixed(1)}MB en ${Date.now() - t0}ms`,
    );
  }

  const buffer = Buffer.from(raw);

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
    if (!composite) {
      // La marca existe pero no se pudo traer. Fallar acá es lo correcto: la
      // foto queda pendiente y se reintenta, en vez de salir sin marca.
      console.warn(`[Watermark] photoId=${photoId} pospuesta: no hay PNG de la marca disponible`);
      return { previewKey: null };
    }

    // Sin mozjpeg: medido sobre una foto real del evento, 468 ms contra 319 ms
    // por el mismo preview. Lo que ahorra en bytes no compensa un tercio más de
    // CPU cuando hay cientos de fotos en cola.
    const watermarked = await sharp(resizedBuffer)
      .composite([composite])
      .jpeg({ quality: PREVIEW_QUALITY })
      .toBuffer();

    // Key versionada. Si se reescribiera siempre en previews/{id}.jpg, para
    // CloudFront la URL no cambia y sigue sirviendo el preview viejo hasta que
    // venza su TTL: regenerar quedaba invisible.
    const previewKey = s3Key(`previews/${photo.id}-${Date.now().toString(36)}.jpg`);

    // El orden es deliberado: primero subir el nuevo, después apuntar la base,
    // y recién al final borrar el viejo. Antes se borraba primero, y si la
    // subida fallaba la base quedaba apuntando a un objeto ya borrado: la
    // galería mostraba una imagen rota y nada la reintentaba, porque para el
    // sistema esa foto seguía "hecha".
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

    // El viejo recién ahora, cuando el nuevo ya está servible. Si este borrado
    // falla queda un huérfano en S3, que es barato; lo contrario —una foto rota
    // en la galería— no.
    if (photo.previewKey && photo.previewKey !== previewKey) {
      if (isS3Key(photo.previewKey)) {
        await deleteS3Objects([photo.previewKey]).catch(() => null);
      } else if (supabase) {
        await supabase.storage.from("photos").remove([photo.previewKey]).catch(() => null);
      }
    }

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

  const rekCollectionId = rekognitionCollectionId(collectionId);

  try {
    await ensureCollection(rekCollectionId);
    const result = await conImagen(photo.storageKey, "FaceIndex", preloaded ?? null, (imagen) =>
      billedCall("IndexFaces", photoId, () =>
      rekognition.send(new IndexFacesCommand({
        CollectionId: rekCollectionId,
        Image: imagen,
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
      ),
    );
    if (!result) return;

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
  const started = Date.now();

  // Sólo dorsal y rostros. Las dos le pasan a Rekognition la referencia en S3
  // y AWS lee el archivo por su cuenta, así que no descargan nada y terminan
  // rápido aunque la red del servidor ande mal.
  //
  // La marca de agua NO va acá. Es la única que baja el original, la que más
  // falla, y la única cuyo fallo se nota enseguida: sin preview la foto no sale
  // a la galería. Ejecutarla en este camino la ataba a una promesa suelta que
  // arranca después de responder el request y que nadie sostiene — si el
  // proceso la descarta, la foto queda sin preview y sin que nadie se entere.
  // Ahora la toma el barrido, que vive en el servidor y retoma solo.
  await Promise.allSettled([runOcr(photoId), runFaceIndex(photoId, collectionId)]);

  console.log(`[process] photoId=${photoId} dorsal y rostros en ${Date.now() - started} ms`);
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
  // Los videos no pasan por acá: lo único que se les hace es la marca de agua,
  // y de eso se ocupa el barrido igual que con las fotos.
  const soloFotos = photos.filter((p) => !p.isVideo);

  let next = 0;
  const worker = async () => {
    while (next < soloFotos.length) {
      const item = soloFotos[next++]!;
      try {
        await processPhoto(item.id, collectionId);
      } catch (err) {
        console.error(`[process] photoId=${item.id} falló:`, err);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, soloFotos.length) }, worker),
  );
}
