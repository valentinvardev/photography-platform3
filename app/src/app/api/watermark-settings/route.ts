import { NextResponse, type NextRequest } from "next/server";
import { auth } from "~/server/auth";
import { putS3Object, deleteS3Objects, s3Key, s3ObjectExists } from "~/lib/s3";
import { resolveMediaUrl } from "~/lib/media";
import { WATERMARK_KEY } from "~/lib/watermark";

/**
 * Import dinámico: photo-processing arrastra sharp, y esta ruta no lo necesita
 * salvo para invalidar el caché.
 *
 * Ojo: el caché vive en memoria de la instancia. En serverless, las otras
 * instancias vivas siguen con el watermark viejo hasta que vence su TTL de
 * 10 minutos.
 */
async function invalidarCacheWatermark() {
  const { resetWatermarkCache } = await import("~/lib/photo-processing");
  resetWatermarkCache();
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = s3Key(WATERMARK_KEY);
  if (!(await s3ObjectExists(key))) return NextResponse.json({ url: null });
  const url = await resolveMediaUrl(key);
  return NextResponse.json({ url });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  await putS3Object(s3Key(WATERMARK_KEY), bytes, file.type);
  // El watermark queda cacheado 10 min en memoria para no bajarlo en cada foto.
  // Sin invalidarlo acá, las subidas siguientes seguirían usando el anterior.
  await invalidarCacheWatermark();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await deleteS3Objects([s3Key(WATERMARK_KEY)]);
  await invalidarCacheWatermark();
  return NextResponse.json({ ok: true });
}
