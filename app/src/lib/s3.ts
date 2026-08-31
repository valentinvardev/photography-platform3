import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  // El SDK viene SIN timeouts: requestTimeout default 0 = infinito (verificado
  // en @smithy/node-http-handler instalado). En este servidor la conexión a S3
  // se muere cada tanto, y un socket muerto sin timeout deja al que llamó
  // esperando para siempre — así se congelaban los workers del watermark, en
  // silencio y hasta reiniciar pm2. requestTimeout holgado porque también pasan
  // videos por acá.
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 10_000,
    requestTimeout: 120_000,
  }),
});

const cfClient = process.env.CLOUDFRONT_DISTRIBUTION_ID
  ? new CloudFrontClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export const S3_BUCKET = process.env.AWS_S3_BUCKET ?? "mediaseller-photos";

/** Prefijo de carpeta dentro del bucket, e.g. "ivana/" para separar clientes. */
export const S3_PREFIX = process.env.AWS_S3_PREFIX
  ? process.env.AWS_S3_PREFIX.replace(/\/?$/, "/")
  : "";

/** Construye una key S3 aplicando el prefijo configurado. */
export function s3Key(path: string): string {
  return `${S3_PREFIX}${path}`;
}

/** Genera una URL firmada para que el browser suba directamente a S3 (PUT). */
export async function createS3UploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

/** Genera una URL firmada para descargar/mostrar una foto desde S3 (GET). */
export async function createS3DownloadUrl(
  key: string,
  expiresIn = 3600,
  responseContentType?: string,
  responseContentDisposition?: string,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ...(responseContentType ? { ResponseContentType: responseContentType } : {}),
    ...(responseContentDisposition ? { ResponseContentDisposition: responseContentDisposition } : {}),
  });
  return getSignedUrl(s3, command, { expiresIn });
}

/** Descarga el contenido de un objeto S3 como bytes. */
export async function getS3ObjectBytes(key: string): Promise<Uint8Array> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
  );
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Sube bytes a S3 directamente desde el servidor. */
export async function putS3Object(
  key: string,
  bytes: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: bytes,
    ContentType: contentType,
  }));
}

/** Verifica si un objeto existe en S3 sin descargarlo. */
export async function s3ObjectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Como s3ObjectExists, pero sin tragarse los fallos: "no existe" y "no pude
 * preguntar" son respuestas distintas. Quien decide si publicar una foto sin
 * marca de agua necesita esa diferencia — ante un 404 el respaldo es legítimo,
 * ante un fallo de red publicar sería regalar la foto.
 */
export async function headS3Object(key: string): Promise<"existe" | "no-existe" | "error"> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return "existe";
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NotFound" || e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) {
      return "no-existe";
    }
    return "error";
  }
}

/** Elimina uno o más objetos de S3. */
export async function deleteS3Objects(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((key) => s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }))),
  );
}

/**
 * Determina si una storageKey apunta a S3 (en lugar de Supabase).
 *
 * Cuidado al agregar carpetas nuevas al bucket: esta lista es la que rutea.
 * El PNG de la marca de agua vive en watermarks/ y no estaba acá, así que
 * downloadBytes lo mandaba a buscar a Supabase, volvía null, y cada foto salía
 * con el texto translúcido de respaldo en vez de la marca — "las marcas de
 * agua no se generan", cuando en realidad se generaban vacías.
 */
export function isS3Key(storageKey: string): boolean {
  return (
    storageKey.startsWith(`${S3_PREFIX}uploads/`) ||
    storageKey.startsWith(`${S3_PREFIX}previews/`) ||
    storageKey.startsWith(`${S3_PREFIX}watermarks/`) ||
    storageKey.startsWith("uploads/") ||
    storageKey.startsWith("previews/") ||
    storageKey.startsWith("watermarks/")
  );
}

/** Returns a CloudFront URL for the given S3 key, or null if CF is not configured. */
export function getCFUrl(key: string): string | null {
  const domain = process.env.CLOUDFRONT_DOMAIN;
  if (!domain) return null;
  if (key.startsWith("http")) return key;
  return `https://${domain}/${key}`;
}

/**
 * Invalidates CloudFront cache for the given paths.
 * Paths must start with "/". Use wildcard: ["/prefix/folder/*"].
 * No-op if CF is not configured or paths is empty.
 */
export async function createCFInvalidation(paths: string[]): Promise<void> {
  if (!cfClient || !process.env.CLOUDFRONT_DISTRIBUTION_ID || paths.length === 0) return;
  try {
    await cfClient.send(
      new CreateInvalidationCommand({
        DistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: Date.now().toString(),
          Paths: { Quantity: paths.length, Items: paths },
        },
      }),
    );
  } catch (err) {
    console.error("[cloudfront] invalidation failed:", err);
  }
}
