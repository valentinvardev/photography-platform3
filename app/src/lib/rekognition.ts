/**
 * Punto único de acceso a Rekognition.
 *
 * Todo lo que gasta plata en Rekognition pasa por acá para que quede registrado
 * con qué plataforma lo pidió. La cuenta de AWS está compartida entre varios
 * proyectos que usan las mismas operaciones sobre el mismo bucket, así que sin
 * esta traza la factura no se puede repartir: DetectText y SearchFacesByImage
 * se mandan por `Bytes` y no dejan rastro asociable a un cliente.
 */

import {
  RekognitionClient,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  DeleteFacesCommand,
} from "@aws-sdk/client-rekognition";

/** Nombre de esta plataforma en los logs. Distinto por deploy. */
export const PLATFORM = process.env.PLATFORM_NAME ?? "sinchi";

export const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION ?? "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/** Nombre de la colección Rekognition para una colección de la DB. */
export function rekognitionCollectionId(collectionId: string): string {
  return `foto-${collectionId.replace(/[^a-zA-Z0-9_.\-]/g, "-")}`;
}

/**
 * Ejecuta una operación facturable dejando una línea de log estructurada.
 * Grepeable por `[rek]` en CloudWatch/Vercel para contar llamadas por
 * plataforma, operación y día sin depender de CloudTrail.
 */
export async function billedCall<T>(
  operation: string,
  subject: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await run();
    console.log(
      `[rek] ${JSON.stringify({
        platform: PLATFORM,
        operation,
        subject,
        result: "ok",
        ms: Date.now() - startedAt,
        at: new Date().toISOString(),
      })}`,
    );
    return result;
  } catch (err) {
    console.log(
      `[rek] ${JSON.stringify({
        platform: PLATFORM,
        operation,
        subject,
        result: "error",
        error: (err as { name?: string }).name ?? "unknown",
        ms: Date.now() - startedAt,
        at: new Date().toISOString(),
      })}`,
    );
    throw err;
  }
}

/** Crea la colección si no existe. No factura por imagen, pero sí es una llamada. */
export async function ensureCollection(rekCollectionId: string): Promise<void> {
  try {
    await rekognition.send(new CreateCollectionCommand({ CollectionId: rekCollectionId }));
    console.log(`[rek] colección creada: ${rekCollectionId}`);
  } catch (err: unknown) {
    if ((err as { name?: string }).name !== "ResourceAlreadyExistsException") throw err;
  }
}

/**
 * Borra la colección Rekognition entera. La guarda de caras se factura por mes
 * y para siempre, así que una colección que ya no existe en la DB es plata que
 * se sigue pagando sin que nadie la use nunca más.
 */
export async function deleteCollection(rekCollectionId: string): Promise<void> {
  try {
    await rekognition.send(new DeleteCollectionCommand({ CollectionId: rekCollectionId }));
    console.log(`[rek] colección borrada: ${rekCollectionId}`);
  } catch (err: unknown) {
    const name = (err as { name?: string }).name;
    if (name === "ResourceNotFoundException") return;
    console.error(`[rek] no se pudo borrar la colección ${rekCollectionId}:`, err);
  }
}

/** Borra caras sueltas de una colección (cuando se borran fotos, no la colección). */
export async function deleteFaces(
  rekCollectionId: string,
  faceIds: string[],
): Promise<void> {
  if (faceIds.length === 0) return;
  // DeleteFaces acepta como máximo 1000 FaceIds por llamada.
  for (let i = 0; i < faceIds.length; i += 1000) {
    const batch = faceIds.slice(i, i + 1000);
    try {
      await rekognition.send(
        new DeleteFacesCommand({ CollectionId: rekCollectionId, FaceIds: batch }),
      );
      console.log(`[rek] ${batch.length} caras borradas de ${rekCollectionId}`);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "ResourceNotFoundException") return;
      console.error(`[rek] no se pudieron borrar caras de ${rekCollectionId}:`, err);
    }
  }
}
