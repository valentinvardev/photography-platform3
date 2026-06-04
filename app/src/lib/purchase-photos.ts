import "server-only";

import { db } from "~/server/db";
import { getCFUrl, createS3DownloadUrl, isS3Key } from "~/lib/s3";
import { createSignedUrl } from "~/lib/supabase/admin";

export type PurchasePhotoThumb = { id: string; filename: string; url: string };

/**
 * Returns preview thumbnail URLs (watermarked previewKey when available)
 * for the photos sold in a purchase. Uses CloudFront when configured.
 */
export async function getPurchasePhotoThumbs(
  purchaseId: string,
  limit = 200,
): Promise<PurchasePhotoThumb[]> {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    select: { photoIds: true, collectionId: true, bibNumber: true },
  });
  if (!purchase) return [];

  let ids: string[] = [];
  try {
    ids = purchase.photoIds ? (JSON.parse(purchase.photoIds) as string[]) : [];
  } catch {
    /* ignore */
  }

  if (ids.length === 0 && purchase.bibNumber) {
    const photos = await db.photo.findMany({
      where: { collectionId: purchase.collectionId, bibNumber: purchase.bibNumber },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    ids = photos.map((p) => p.id);
  }

  if (ids.length === 0) return [];

  const photos = await db.photo.findMany({
    where: { id: { in: ids } },
    orderBy: { order: "asc" },
    take: limit,
    select: { id: true, filename: true, storageKey: true, previewKey: true },
  });

  const results = await Promise.all(
    photos.map(async (p) => {
      const key = p.previewKey ?? p.storageKey;
      let url: string | null;
      if (isS3Key(key)) {
        url = getCFUrl(key) ?? (await createS3DownloadUrl(key, 3600 * 24));
      } else {
        url = await createSignedUrl(key, 3600 * 24);
      }
      return url ? { id: p.id, filename: p.filename, url } : null;
    }),
  );

  return results.filter((r): r is PurchasePhotoThumb => r !== null);
}
