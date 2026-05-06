import { NextResponse } from "next/server";
import { db } from "~/server/db";

type PhotoInput = {
  storageKey: string;
  filename: string;
  mimeType?: string;
  fileSize?: number;
};

export async function POST(req: Request) {
  const body = (await req.json()) as { collectionId?: string; photos?: PhotoInput[] };
  const { collectionId, photos } = body;
  if (!collectionId || !photos?.length) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const count = await db.photo.count({ where: { collectionId } });
  const created = await Promise.all(
    photos.map((p, i) =>
      db.photo.create({
        data: {
          collectionId,
          storageKey: p.storageKey,
          filename: p.filename,
          mimeType: p.mimeType ?? null,
          fileSize: p.fileSize,
          order: count + i,
        },
        select: { id: true, mimeType: true },
      }),
    ),
  );

  void (async () => {
    const { runOcr, runWatermark, runFaceIndex } = await import("~/lib/photo-processing");
    for (let i = 0; i < created.length; i++) {
      const photo = created[i]!;
      await new Promise((r) => setTimeout(r, i * 400));
      const isVideo = photo.mimeType?.startsWith("video/") ?? false;
      if (!isVideo) {
        void runOcr(photo.id);
        void runWatermark(photo.id);
        void runFaceIndex(photo.id, collectionId);
      }
    }
  })();

  return NextResponse.json({ ids: created.map((c) => c.id) });
}
