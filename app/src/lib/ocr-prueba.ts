/**
 * Prueba A/B de lectura de dorsales: Google Vision contra Rekognition, sobre la
 * misma foto y con las mismas reglas de extracción (`~/lib/dorsal`).
 *
 * Pensada para correr sobre un álbum de prueba (ver
 * scripts/crear-album-prueba.mjs) con fotos que quedaron sin dorsal. Guarda en
 * `bibNumber` lo que lee Google —así el resultado se ve en la galería— y deja
 * en el log y en el resumen del trabajo lo que hubiera dicho Rekognition con
 * el filtro nuevo y con el filtro actual de producción. Con esos tres números
 * se sabe cuánto aporta cambiar de motor y cuánto aporta cambiar de filtro.
 *
 * Costo por foto: una unidad de Vision (gratis hasta 1000 por mes) y una
 * llamada DetectText (US$0,001).
 */

import { DetectTextCommand } from "@aws-sdk/client-rekognition";
import { db } from "~/server/db";
import { billedCall, rekognition } from "~/lib/rekognition";
import { conImagen, extractAllBibs, loadPhotoBytes } from "~/lib/photo-processing";
import { extraerDorsales, type LineaOcr } from "~/lib/dorsal";
import { detectarTextoGoogle, googleVisionDisponible } from "~/lib/ocr-google";

export type ResultadoPrueba = {
  google: string[];
  rekognitionNuevo: string[];
  rekognitionActual: string[];
};

/**
 * Falla del lado de Google (sin clave, cuota, 403). Se distingue del resto
 * porque no tiene sentido seguir con la foto siguiente: cada una pagaría su
 * DetectText para terminar igual. El trabajo se corta al primero.
 */
export class ErrorGoogleVision extends Error {}

export async function runOcrPrueba(photoId: string): Promise<ResultadoPrueba> {
  // Antes de bajar nada ni pagar nada.
  if (!googleVisionDisponible()) {
    throw new ErrorGoogleVision("GOOGLE_VISION_API_KEY no está configurada en el .env");
  }

  const photo = await db.photo.findUnique({
    where: { id: photoId },
    select: { id: true, storageKey: true },
  });
  if (!photo) throw new Error("la foto no existe");

  // Google necesita los píxeles, así que acá sí se baja el original. Es la
  // única etapa de OCR que lo hace; Rekognition sigue leyendo de S3 y sólo
  // recibiría estos bytes si la foto no estuviera ahí.
  const bytes = await loadPhotoBytes(photo.storageKey, "OCR-prueba");
  if (!bytes) throw new Error("no se pudo bajar el original");

  const [lineasGoogle, respuestaRek] = await Promise.all([
    detectarTextoGoogle(bytes.raw, photoId).catch((err: unknown) => {
      throw new ErrorGoogleVision(err instanceof Error ? err.message : String(err));
    }),
    conImagen(photo.storageKey, "OCR-prueba", bytes, (imagen) =>
      billedCall("DetectText", photoId, () =>
        rekognition.send(new DetectTextCommand({ Image: imagen })),
      ),
    ),
  ]);

  const detecciones = respuestaRek?.TextDetections ?? [];
  const lineasRek: LineaOcr[] = detecciones
    .filter((d) => d.Type === "LINE")
    .map((d) => ({ texto: d.DetectedText ?? "", confianza: d.Confidence ?? 0 }));

  const resultado: ResultadoPrueba = {
    google: extraerDorsales(lineasGoogle),
    rekognitionNuevo: extraerDorsales(lineasRek),
    rekognitionActual: extractAllBibs(detecciones),
  };

  // Sólo el mejor candidato: guardar varios separados por coma rompe la
  // búsqueda exacta y la agrupación por persona.
  await db.photo.update({
    where: { id: photoId },
    data: { ocrAttemptedAt: new Date(), bibNumber: resultado.google[0] ?? null },
  });

  const mostrar = (l: string[]) => l.join(",") || "-";
  console.log(
    `[ocr-prueba] photoId=${photoId} google=${mostrar(resultado.google)} ` +
      `rekNuevo=${mostrar(resultado.rekognitionNuevo)} rekActual=${mostrar(resultado.rekognitionActual)} ` +
      `lineasGoogle=${JSON.stringify(lineasGoogle.slice(0, 8))} ` +
      `lineasRek=${JSON.stringify(lineasRek.slice(0, 8))}`,
  );
  return resultado;
}

/** Acumula un resultado en el resumen del trabajo (ver reprocess-jobs). */
export function sumarAlResumen(resumen: Record<string, number>, r: ResultadoPrueba): void {
  const mas = (clave: string) => {
    resumen[clave] = (resumen[clave] ?? 0) + 1;
  };
  const g = r.google.length > 0;
  const n = r.rekognitionNuevo.length > 0;
  const a = r.rekognitionActual.length > 0;
  mas("fotos");
  if (g) mas("google");
  if (n) mas("rekognitionNuevo");
  if (a) mas("rekognitionActual");
  if (g && n) mas("ambos");
  if (g && !n) mas("soloGoogle");
  if (!g && n) mas("soloRekognition");
  if (!g && !n) mas("ninguno");
  if (g && n && r.google[0] === r.rekognitionNuevo[0]) mas("coinciden");
}
