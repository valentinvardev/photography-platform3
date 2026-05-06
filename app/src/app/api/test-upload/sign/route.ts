import path from "path";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { createS3UploadUrl, s3Key } from "~/lib/s3";

export async function POST(req: Request) {
  const body = (await req.json()) as { slug?: string; filename?: string; contentType?: string };
  const { slug, filename, contentType } = body;
  if (!slug || !filename || !contentType) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }
  const collection = await db.collection.findUnique({ where: { slug }, select: { id: true } });
  if (!collection) {
    return NextResponse.json({ error: "Colección no encontrada" }, { status: 404 });
  }
  const ext = path.extname(filename).toLowerCase() || ".jpg";
  const key = s3Key(`uploads/${collection.id}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  const uploadUrl = await createS3UploadUrl(key, contentType);
  return NextResponse.json({ uploadUrl, key, collectionId: collection.id });
}
