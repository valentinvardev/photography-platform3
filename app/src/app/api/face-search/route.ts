import { type NextRequest, NextResponse } from "next/server";
import { SearchFacesByImageCommand } from "@aws-sdk/client-rekognition";
import { db } from "~/server/db";
import { billedCall, rekognition, rekognitionCollectionId } from "~/lib/rekognition";
import { clientIp, rateLimit } from "~/lib/rate-limit";

/**
 * Búsqueda por selfie. Es el único endpoint público que gasta plata en AWS:
 * cada request es un SearchFacesByImage facturado. Sin los topes de acá,
 * cualquiera con el collectionId (que viaja al cliente en la página pública)
 * puede subir la factura de Rekognition sin límite.
 */

/** Rekognition rechaza imágenes por Bytes de más de 5 MB — cortamos antes de pagar. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const PER_MINUTE = 8;
const PER_HOUR = 40;

/** El cliente comprime a ~1200px antes de subir; base64 infla ~4/3. */
const MAX_BODY_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024;

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Demasiadas búsquedas seguidas. Esperá un momento." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/** Sólo aceptamos requests que vengan de nuestra propia página. */
function originAllowed(req: NextRequest): boolean {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (!base) return true; // sin base configurada no podemos comparar

  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(base).host;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);

    const perMinute = rateLimit(`face:${ip}:m`, PER_MINUTE, 60_000);
    if (!perMinute.ok) {
      console.warn(`[face-search] rate limit (minuto) ip=${ip}`);
      return tooMany(perMinute.retryAfter);
    }
    const perHour = rateLimit(`face:${ip}:h`, PER_HOUR, 3_600_000);
    if (!perHour.ok) {
      console.warn(`[face-search] rate limit (hora) ip=${ip}`);
      return tooMany(perHour.retryAfter);
    }

    if (!originAllowed(req)) {
      console.warn(`[face-search] origen rechazado ip=${ip} origin=${req.headers.get("origin") ?? "-"}`);
      return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) {
      return NextResponse.json(
        { error: "La imagen es demasiado grande.", noFaceDetected: true },
        { status: 413 },
      );
    }

    const { imageBase64, collectionId } = JSON.parse(raw) as {
      imageBase64?: string;
      collectionId?: string;
    };

    if (!imageBase64 || !collectionId) {
      return NextResponse.json({ error: "Missing imageBase64 or collectionId" }, { status: 400 });
    }

    const collection = await db.collection.findFirst({
      where: { id: collectionId, isPublished: true },
      select: { id: true },
    });
    if (!collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const imageBytes = Buffer.from(imageBase64, "base64");
    if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "La imagen es demasiado grande.", noFaceDetected: true },
        { status: 413 },
      );
    }

    const rekCollectionId = rekognitionCollectionId(collectionId);

    let matchedPhotoIds: string[] = [];
    try {
      const result = await billedCall("SearchFacesByImage", rekCollectionId, () =>
        rekognition.send(new SearchFacesByImageCommand({
          CollectionId: rekCollectionId,
          Image: { Bytes: new Uint8Array(imageBytes) },
          MaxFaces: 50,
          FaceMatchThreshold: 80,
        })),
      );

      matchedPhotoIds = [
        ...new Set(
          (result.FaceMatches ?? [])
            .map((m) => m.Face?.ExternalImageId)
            .filter((id): id is string => !!id)
        ),
      ];
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "InvalidParameterException") {
        return NextResponse.json({ groups: [], noFaceDetected: true });
      }
      if ((err as { name?: string }).name === "ResourceNotFoundException") {
        return NextResponse.json({ groups: [] });
      }
      if ((err as { name?: string }).name === "ImageTooLargeException") {
        return NextResponse.json({ groups: [], noFaceDetected: true });
      }
      throw err;
    }

    if (matchedPhotoIds.length === 0) {
      return NextResponse.json({ groups: [] });
    }

    const photos = await db.photo.findMany({
      where: { id: { in: matchedPhotoIds }, collectionId },
      select: { id: true, bibNumber: true },
    });

    const bibMap = new Map<string, string[]>();
    for (const p of photos) {
      const key = p.bibNumber ?? "sin-dorsal";
      if (!bibMap.has(key)) bibMap.set(key, []);
      bibMap.get(key)!.push(p.id);
    }

    const groups = Array.from(bibMap.entries()).map(([bib, photoIds]) => ({
      bib,
      photoIds,
    }));

    console.log(`[face-search] collectionId=${collectionId} found ${matchedPhotoIds.length} photos in ${groups.length} groups`);
    return NextResponse.json({ groups });
  } catch (err) {
    console.error("[face-search] error:", err);
    return NextResponse.json({ error: "Face search failed" }, { status: 500 });
  }
}
