/**
 * Lambda handler — dispara con s3:ObjectCreated en mediaseller-photos
 *
 * Flujo por foto:
 *   1. Descarga bytes desde S3
 *   2. DetectText (OCR para número de dorsal)
 *   3. IndexFaces (reconocimiento facial)
 *   4. Crea/actualiza el registro Photo en Supabase via Prisma
 *   5. Guarda FaceRecords en DB
 *
 * Si lanza un error, AWS reintenta 2 veces y luego envía a la DLQ.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  RekognitionClient,
  DetectTextCommand,
  IndexFacesCommand,
  CreateCollectionCommand,
  type TextDetection,
} from "@aws-sdk/client-rekognition";
import { PrismaClient } from "@prisma/client";
import type { S3Event, S3Handler } from "aws-lambda";

// ── Clientes (reutilizados entre invocaciones warm) ───────────────────────────

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-2" });

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION ?? "us-east-2",
});

// Prisma con PgBouncer (transaction mode) para no agotar el pool
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

// ── OCR helpers ───────────────────────────────────────────────────────────────

function extractBibs(detections: TextDetection[]): string | null {
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
      candidates.push({ value: m, score: lenScore + isolatedBonus + confidence / 50 });
    }
  }

  if (candidates.length === 0) return null;

  const best = new Map<string, number>();
  for (const c of candidates) {
    if (!best.has(c.value) || best.get(c.value)! < c.score) {
      best.set(c.value, c.score);
    }
  }

  return Array.from(best.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v)
    .join(",");
}

// ── Rekognition collection helpers ────────────────────────────────────────────

function collectionId(prismaCollectionId: string): string {
  return `foto-${prismaCollectionId.replace(/[^a-zA-Z0-9_.\-]/g, "-")}`;
}

async function ensureCollection(rekCollId: string): Promise<void> {
  try {
    await rekognition.send(new CreateCollectionCommand({ CollectionId: rekCollId }));
  } catch (err: unknown) {
    if ((err as { name?: string }).name !== "ResourceAlreadyExistsException") throw err;
  }
}

// ── S3 download ───────────────────────────────────────────────────────────────

async function downloadS3(bucket: string, key: string): Promise<Uint8Array> {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// ── Key parsing ───────────────────────────────────────────────────────────────
// Estructura esperada: uploads/{collectionId}/{filename}

function parseKey(key: string): { collectionId: string; filename: string } | null {
  const parts = key.split("/");
  if (parts.length < 3 || parts[0] !== "uploads") return null;
  return {
    collectionId: parts[1]!,
    filename: parts.slice(2).join("/"),
  };
}

// ── Handler principal ─────────────────────────────────────────────────────────

export const handler: S3Handler = async (event: S3Event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const fileSize = record.s3.object.size;

    console.log(`[Lambda] Procesando: s3://${bucket}/${key}`);

    const parsed = parseKey(key);
    if (!parsed) {
      console.warn(`[Lambda] Key ignorada (no coincide con uploads/...): ${key}`);
      continue;
    }

    const { collectionId: dbCollectionId, filename } = parsed;

    // ── Idempotencia ──────────────────────────────────────────────────────────
    // Si ya existe una Photo para esta key, no volvemos a procesar. Esto cubre
    // dos casos que se pagan dos veces: el reintento de AWS tras un error, y la
    // app registrando la misma subida por su cuenta desde bulkAdd. Sin esta
    // guarda, cada foto puede costar 4 operaciones de Rekognition en vez de 2.
    const existing = await prisma.photo.findFirst({
      where: { storageKey: key },
      select: { id: true },
    });
    if (existing) {
      console.log(`[Lambda] key=${key} ya procesada (photoId=${existing.id}) — se omite`);
      continue;
    }

    // Verificar que la colección existe
    const collection = await prisma.collection.findUnique({
      where: { id: dbCollectionId },
      select: { id: true },
    });
    if (!collection) {
      throw new Error(`Colección no encontrada: ${dbCollectionId} (key: ${key})`);
    }

    // ── Crear registro Photo ANTES de gastar en Rekognition ───────────────────
    // El orden importa: si el insert falla después del OCR, la excepción llega
    // a AWS, que reintenta el record hasta 2 veces más y vuelve a pagar el OCR
    // cada vez. Creando la fila primero, un fallo de DB no cuesta nada, y un
    // reintento encuentra la fila y sale por la guarda de arriba.
    const photo = await prisma.photo.create({
      data: {
        collectionId: dbCollectionId,
        storageKey: key,
        filename,
        fileSize,
        bibNumber: null,
        order: await prisma.photo.count({ where: { collectionId: dbCollectionId } }),
      },
    });
    console.log(`[Lambda] Photo creada id=${photo.id}`);

    // A partir de acá nada se relanza: la fila ya existe y un reintento sólo
    // volvería a pagar Rekognition sin arreglar nada.
    try {
      const imageBytes = await downloadS3(bucket, key);

      // ── OCR (DetectText) ────────────────────────────────────────────────────
      try {
        const ocrResult = await rekognition.send(
          new DetectTextCommand({ Image: { Bytes: imageBytes } }),
        );
        const bibNumber = extractBibs(ocrResult.TextDetections ?? []);
        console.log(`[Lambda] OCR key=${key} bib=${bibNumber ?? "none"}`);
        if (bibNumber) {
          await prisma.photo.update({ where: { id: photo.id }, data: { bibNumber } });
        }
      } catch (err) {
        console.error(`[Lambda] OCR falló para key=${key}:`, err);
      }

      // ── Face Index (IndexFaces) ─────────────────────────────────────────────
      try {
        const rekCollId = collectionId(dbCollectionId);
        await ensureCollection(rekCollId);

        const faceResult = await rekognition.send(
          new IndexFacesCommand({
            CollectionId: rekCollId,
            Image: { Bytes: imageBytes },
            ExternalImageId: photo.id,
            DetectionAttributes: [],
            MaxFaces: 10,
          }),
        );

        const faceRecords = faceResult.FaceRecords ?? [];
        console.log(`[Lambda] FaceIndex id=${photo.id} caras=${faceRecords.length}`);

        for (const fr of faceRecords) {
          const faceId = fr.Face?.FaceId;
          if (!faceId) continue;
          await prisma.faceRecord.upsert({
            where: { rekFaceId: faceId },
            update: { photoId: photo.id, collectionId: dbCollectionId, confidence: fr.Face?.Confidence ?? null },
            create: { rekFaceId: faceId, photoId: photo.id, collectionId: dbCollectionId, confidence: fr.Face?.Confidence ?? null },
          });
        }
      } catch (err) {
        console.error(`[Lambda] FaceIndex falló para id=${photo.id}:`, err);
      }
    } catch (err) {
      console.error(`[Lambda] Procesamiento falló para id=${photo.id}:`, err);
    }
  }
};
