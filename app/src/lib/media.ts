import "server-only";

import { getCFUrl, createS3DownloadUrl, isS3Key } from "~/lib/s3";
import { createSignedUrl } from "~/lib/supabase/admin";

/**
 * Resolves a display URL for a media key.
 * Uses CloudFront when configured (production), presigned S3 as fallback (dev).
 * For Supabase-stored keys, falls back to Supabase signed URLs.
 * Never use this for post-purchase original downloads — those always use presigned S3.
 */
export async function resolveMediaUrl(
  key: string,
  opts?: { expiresIn?: number; contentType?: string },
): Promise<string | null> {
  if (!key) return null;
  if (key.startsWith("http")) return key;
  if (isS3Key(key)) {
    return getCFUrl(key) ?? createS3DownloadUrl(key, opts?.expiresIn ?? 3600, opts?.contentType);
  }
  return createSignedUrl(key, opts?.expiresIn ?? 3600);
}
