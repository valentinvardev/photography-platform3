import { NextResponse, type NextRequest } from "next/server";
import { auth } from "~/server/auth";
import { putS3Object, deleteS3Objects, s3Key, s3ObjectExists } from "~/lib/s3";
import { resolveMediaUrl } from "~/lib/media";
import { WATERMARK_KEY } from "~/lib/watermark";

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
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await deleteS3Objects([s3Key(WATERMARK_KEY)]);
  return NextResponse.json({ ok: true });
}
