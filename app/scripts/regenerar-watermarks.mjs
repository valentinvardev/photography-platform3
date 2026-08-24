/**
 * Genera la marca de agua de todas las fotos que no la tienen.
 *
 * Corre solo, en el servidor. No pasa por el navegador, ni por HTTP, ni por el
 * proxy, ni por Next: son justo las piezas que venían rompiendo el reprocesado
 * desde el panel. Acá sólo hay base de datos, S3 y sharp.
 *
 *   cd ~/sinchifoto/app
 *   node scripts/regenerar-watermarks.mjs --dry            # sin escribir nada
 *   node scripts/regenerar-watermarks.mjs                  # todas las colecciones
 *   node scripts/regenerar-watermarks.mjs --coleccion=<id>
 *   node scripts/regenerar-watermarks.mjs --concurrencia=8
 *
 * Para que siga aunque cierres la terminal:
 *   nohup node scripts/regenerar-watermarks.mjs > watermarks.log 2>&1 &
 *   tail -f watermarks.log
 *
 * Es interrumpible y retomable: cada vuelta vuelve a preguntar qué falta, así
 * que si lo cortás con Ctrl+C y lo volvés a correr, sigue donde quedó.
 */

import { readFileSync } from "node:fs";
import sharp from "sharp";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (m) process.env[m[1]] ??= m[2];
}

const arg = (nombre, porDefecto) => {
  const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return encontrado ? encontrado.split("=")[1] : porDefecto;
};
const DRY = process.argv.includes("--dry");
const COLECCION = arg("coleccion", null);
const CONCURRENCIA = Number(arg("concurrencia", "6"));
const LOTE = 50;

const BUCKET = process.env.AWS_S3_BUCKET;
const PREFIJO = (process.env.AWS_S3_PREFIX ?? "").replace(/\/?$/, "/");
const CF = process.env.CLOUDFRONT_DOMAIN;
const TOPE_DESCARGA_MS = 45_000;

// Mismos valores que usa la app, para que los previews salgan idénticos.
const ANCHO_PREVIEW = 1600;
const CALIDAD_PREVIEW = 65;
const CLAVE_WATERMARK = `${PREFIJO}watermarks/active.png`;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const { PrismaClient } = await import("../generated/prisma/index.js");
const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

// libvips usa 16 hilos por operación; el paralelismo lo maneja el pool de acá.
sharp.concurrency(1);

// ── Descarga ─────────────────────────────────────────────────────────────────

async function bajarDeS3(key) {
  const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    abortSignal: AbortSignal.timeout(TOPE_DESCARGA_MS),
  });
  const trozos = [];
  for await (const x of r.Body) trozos.push(x);
  return Buffer.concat(trozos);
}

async function bajar(key) {
  if (CF) {
    try {
      const res = await fetch(`https://${CF}/${key}`, {
        signal: AbortSignal.timeout(TOPE_DESCARGA_MS),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      // se prueba S3 directo
    }
  }
  return bajarDeS3(key);
}

// ── Watermark ────────────────────────────────────────────────────────────────

let wmPng = null;
const cacheComposite = new Map();

function compositeFallback() {
  const t = 220;
  const m = t / 2;
  return {
    input: Buffer.from(
      `<svg width="${t}" height="${t}" xmlns="http://www.w3.org/2000/svg">` +
        `<text x="${m}" y="${m}" text-anchor="middle" dominant-baseline="middle" ` +
        `font-family="Arial, sans-serif" font-size="22" font-weight="bold" letter-spacing="3" ` +
        `fill="rgba(255,255,255,0.38)" transform="rotate(-35, ${m}, ${m})">PREVIEW</text></svg>`,
    ),
    tile: true,
    blend: "over",
  };
}

async function composite(ancho, alto) {
  if (!wmPng) return compositeFallback();

  const meta = await sharp(wmPng).metadata();
  const anchoObjetivo = Math.round(Math.min(ancho, alto) * 0.4);
  const altoObjetivo = Math.round((meta.height / meta.width) * anchoObjetivo);
  const clave = `${anchoObjetivo}x${altoObjetivo}`;

  let escalado = cacheComposite.get(clave);
  if (!escalado) {
    escalado = await sharp(wmPng)
      .resize(anchoObjetivo, altoObjetivo, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .rotate(-35, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    cacheComposite.set(clave, escalado);
  }
  return { input: escalado, tile: true, blend: "over" };
}

async function procesar(foto) {
  const t0 = Date.now();
  const original = await bajar(foto.storageKey);
  const msBajada = Date.now() - t0;

  const t1 = Date.now();
  const { data: redimensionada, info } = await sharp(original)
    .resize({ width: ANCHO_PREVIEW, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const marcada = await sharp(redimensionada)
    .composite([await composite(info.width, info.height)])
    .jpeg({ quality: CALIDAD_PREVIEW })
    .toBuffer();
  const msImagen = Date.now() - t1;

  const previewKey = `${PREFIJO}previews/${foto.id}.jpg`;

  const t2 = Date.now();
  if (!DRY) {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: previewKey,
        Body: marcada,
        ContentType: "image/jpeg",
      }),
    );
    await db.photo.update({
      where: { id: foto.id },
      data: { previewKey, previewGeneratedAt: new Date() },
    });
  }
  const msSubida = Date.now() - t2;

  return { msBajada, msImagen, msSubida, bytes: marcada.length };
}

// ── Main ─────────────────────────────────────────────────────────────────────

try {
  wmPng = await bajarDeS3(CLAVE_WATERMARK);
  console.log(`watermark cargado: ${(wmPng.length / 1024).toFixed(0)} KB`);
} catch {
  console.warn(`SIN watermark en ${CLAVE_WATERMARK} — se usa el texto PREVIEW`);
}

const where = {
  previewKey: null,
  ...(COLECCION ? { collectionId: COLECCION } : {}),
};

const total = await db.photo.count({ where });
console.log(
  `${total} fotos sin marca de agua${COLECCION ? ` en ${COLECCION}` : " (todas las colecciones)"}` +
    `${DRY ? "  [DRY RUN, no escribe nada]" : ""}\n`,
);

if (total === 0) {
  await db.$disconnect();
  process.exit(0);
}

let hechas = 0;
let fallidas = 0;
const arranque = Date.now();
const tiempos = { bajada: 0, imagen: 0, subida: 0 };

for (;;) {
  const lote = await db.photo.findMany({
    where,
    select: { id: true, storageKey: true, filename: true },
    orderBy: { order: "asc" },
    take: LOTE,
    // En dry run nada sale del filtro, así que hay que avanzar a mano.
    ...(DRY ? { skip: hechas + fallidas } : {}),
  });
  if (lote.length === 0) break;

  let siguiente = 0;
  const worker = async () => {
    while (siguiente < lote.length) {
      const foto = lote[siguiente++];
      try {
        const t = await procesar(foto);
        hechas++;
        tiempos.bajada += t.msBajada;
        tiempos.imagen += t.msImagen;
        tiempos.subida += t.msSubida;
        const transcurrido = (Date.now() - arranque) / 1000;
        const restantes = total - hechas - fallidas;
        const eta = hechas > 0 ? Math.ceil((restantes * (transcurrido / hechas)) / 60) : "?";
        console.log(
          `[${String(hechas + fallidas).padStart(4)}/${total}] ${foto.filename.slice(-28).padEnd(28)} ` +
            `bajada ${String(t.msBajada).padStart(6)}ms  imagen ${String(t.msImagen).padStart(5)}ms  ` +
            `subida ${String(t.msSubida).padStart(5)}ms   faltan ~${eta} min`,
        );
      } catch (err) {
        fallidas++;
        console.error(`[${String(hechas + fallidas).padStart(4)}/${total}] FALLÓ ${foto.id}: ${err.name} ${err.message?.slice(0, 90)}`);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCIA, lote.length) }, worker),
  );

  if (DRY) break;
}

const seg = (Date.now() - arranque) / 1000;
console.log(`\n── listo en ${(seg / 60).toFixed(1)} min`);
console.log(`   hechas ${hechas}   fallidas ${fallidas}`);
if (hechas > 0) {
  console.log(
    `   promedio por foto: bajada ${Math.round(tiempos.bajada / hechas)}ms · ` +
      `imagen ${Math.round(tiempos.imagen / hechas)}ms · subida ${Math.round(tiempos.subida / hechas)}ms`,
  );
}

await db.$disconnect();
