import { NextResponse, type NextRequest } from "next/server";
import { auth } from "~/server/auth";
import { createS3UploadUrl, getCFUrl, createS3DownloadUrl, s3Key } from "~/lib/s3";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as { path?: string; contentType?: string };
  if (!body.path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const key = s3Key(body.path);
  const contentType = body.contentType ?? "application/octet-stream";

  const signedUrl = await createS3UploadUrl(key, contentType, 300);
  const publicUrl = getCFUrl(key) ?? await createS3DownloadUrl(key, 3600);

  return NextResponse.json({ signedUrl, token: null, path: key, publicUrl });
}
