/**
 * Crea un álbum de prueba con COPIAS de N fotos sin dorsal de otro álbum.
 *
 * Para probar Google Vision sin tocar el álbum real: el botón "Dorsales con
 * Google Vision (prueba)" del panel de reprocesado se corre sobre este álbum,
 * y lo que lea Google se ve en su galería. El álbum queda sin publicar.
 *
 *   cd ~/sinchifoto/app
 *   node scripts/crear-album-prueba.mjs --origen=downhill-4to-round-pan-de-azucar --cantidad=100 --dry
 *   node scripts/crear-album-prueba.mjs --origen=downhill-4to-round-pan-de-azucar --cantidad=100
 *
 * Qué hace, y por qué así:
 * - Copia originales y previews con CopyObject dentro de S3: no baja ni sube
 *   nada, 100 fotos tardan segundos.
 * - Son copias con keys propias. Borrar el álbum de prueba desde el admin
 *   borra sus copias y NADA del álbum original.
 * - Las filas nacen con ocrAttemptedAt, faceAttemptedAt y previewKey puestos,
 *   así ni el barrido de marcas de agua ni los botones de OCR/rostros les
 *   vuelven a pagar Rekognition. Sólo el botón de la prueba las toca.
 * - Deja un JSON con la correspondencia copia → original, para comparar
 *   después contra lo que tenga el álbum real.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { S3Client, CopyObjectCommand } from "@aws-sdk/client-s3";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (m) process.env[m[1]] ??= m[2];
}

const arg = (nombre, porDefecto) => {
  const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return encontrado ? encontrado.split("=").slice(1).join("=") : porDefecto;
};
const DRY = process.argv.includes("--dry");
const ORIGEN = arg("origen", null);
const CANTIDAD = Number(arg("cantidad", "100"));
const CONCURRENCIA = 4;

if (!ORIGEN || !Number.isInteger(CANTIDAD) || CANTIDAD < 1) {
  console.error("Uso: node scripts/crear-album-prueba.mjs --origen=<slug o id> --cantidad=100 [--dry]");
  process.exit(1);
}

const BUCKET = process.env.AWS_S3_BUCKET;
const PREFIJO = (process.env.AWS_S3_PREFIX ?? "").replace(/\/?$/, "/");
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

// ── Origen ───────────────────────────────────────────────────────────────────

const origen =
  (await db.collection.findFirst({ where: { slug: ORIGEN } })) ??
  (await db.collection.findUnique({ where: { id: ORIGEN } }));
if (!origen) {
  console.error(`✗ No existe una colección con slug o id "${ORIGEN}".`);
  await db.$disconnect();
  process.exit(1);
}

// Barrera contra la plataforma equivocada: el bucket es compartido por prefijo
// y la base no. Si el .env mezcla los dos, se copiarían fotos de un cliente a
// la carpeta de otro. Misma guarda que en regenerar-watermarks.mjs.
const muestra = await db.photo.findMany({
  where: { collectionId: origen.id },
  select: { storageKey: true },
  take: 20,
});
const prefijosReales = [...new Set(muestra.map((p) => p.storageKey.split("/")[0] + "/"))];
if (prefijosReales.length > 0 && !prefijosReales.includes(PREFIJO)) {
  console.error(`\n✗ PARÁ. La base y el bucket no son de la misma plataforma.`);
  console.error(`   AWS_S3_PREFIX configurado : ${PREFIJO || "(sin prefijo)"}`);
  console.error(`   prefijo de las fotos      : ${prefijosReales.join(", ")}`);
  await db.$disconnect();
  process.exit(1);
}

const slugPrueba = `prueba-google-${origen.slug}`.slice(0, 80);
const existente = await db.collection.findUnique({ where: { slug: slugPrueba } });
if (existente) {
  console.error(`✗ Ya existe el álbum de prueba "${slugPrueba}" (id ${existente.id}).`);
  console.error(`   Borralo desde el admin y volvé a correr.`);
  await db.$disconnect();
  process.exit(1);
}

// ── Selección ────────────────────────────────────────────────────────────────
// Sin dorsal, con preview (para que se vean en la galería) y sin videos.
const candidatas = await db.photo.findMany({
  where: {
    collectionId: origen.id,
    bibNumber: null,
    previewKey: { not: null },
    NOT: { mimeType: { startsWith: "video/" } },
  },
  orderBy: { order: "asc" },
});
if (candidatas.length === 0) {
  console.error(`✗ "${origen.title}" no tiene fotos sin dorsal con preview.`);
  await db.$disconnect();
  process.exit(1);
}

// Repartidas a lo largo del álbum, no las primeras N: así entran distintos
// puntos de la pista, distintas luces y distintos corredores.
const cuantas = Math.min(CANTIDAD, candidatas.length);
const elegidas = Array.from(
  { length: cuantas },
  (_, i) => candidatas[Math.floor((i * candidatas.length) / cuantas)],
);

console.log(
  `Origen: "${origen.title}" (${origen.id})\n` +
    `Sin dorsal con preview: ${candidatas.length} · se copian ${elegidas.length}` +
    `${DRY ? "  [DRY RUN, no escribe nada]" : ""}\n`,
);
if (DRY) {
  for (const p of elegidas.slice(0, 10)) console.log(`  ${p.id}  ${p.filename}`);
  if (elegidas.length > 10) console.log(`  … y ${elegidas.length - 10} más`);
  await db.$disconnect();
  process.exit(0);
}

// ── Álbum de prueba ──────────────────────────────────────────────────────────

const prueba = await db.collection.create({
  data: {
    title: `${origen.title} · PRUEBA GOOGLE`,
    slug: slugPrueba,
    description:
      `Álbum de prueba: copias de ${elegidas.length} fotos sin dorsal de "${origen.title}" ` +
      `para comparar Google Vision con Rekognition. No publicar. Se puede borrar.`,
    isPublished: false,
    pricePerBib: origen.pricePerBib,
    packPrice: origen.packPrice,
    currency: origen.currency,
    categoryId: origen.categoryId,
    eventDate: origen.eventDate,
    location: origen.location,
    watermarkStorageKey: origen.watermarkStorageKey,
  },
});
console.log(`Álbum creado: ${prueba.title} (${prueba.id})\n`);

const copiar = async (desde, hacia) => {
  await s3.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${encodeURIComponent(desde).replace(/%2F/g, "/")}`,
      Key: hacia,
    }),
  );
};

const correspondencia = [];
let hechas = 0;
let fallidas = 0;
let siguiente = 0;
const ahora = Date.now().toString(36);

const worker = async () => {
  while (siguiente < elegidas.length) {
    const i = siguiente++;
    const p = elegidas[i];
    const nombreOriginal = p.storageKey.split("/").pop();
    const extPreview = p.previewKey.split(".").pop() ?? "jpg";
    const storageKey = `${PREFIJO}uploads/${prueba.id}/${nombreOriginal}`;
    const previewKey = `${PREFIJO}previews/prueba-${prueba.id}-${i}-${ahora}.${extPreview}`;
    try {
      await copiar(p.storageKey, storageKey);
      await copiar(p.previewKey, previewKey);
      const copia = await db.photo.create({
        data: {
          collectionId: prueba.id,
          storageKey,
          previewKey,
          previewGeneratedAt: new Date(),
          filename: p.filename,
          mimeType: p.mimeType,
          fileSize: p.fileSize,
          width: p.width,
          height: p.height,
          order: i,
          bibNumber: null,
          // Marcadas como ya intentadas: sólo el botón de la prueba las procesa.
          ocrAttemptedAt: new Date(),
          faceAttemptedAt: new Date(),
        },
        select: { id: true },
      });
      correspondencia.push({ copia: copia.id, original: p.id, filename: p.filename });
      hechas++;
      if (hechas % 20 === 0) console.log(`  ${hechas}/${elegidas.length}`);
    } catch (err) {
      fallidas++;
      console.error(`  ✗ ${p.id} (${p.filename}):`, err?.message ?? err);
    }
  }
};
await Promise.all(Array.from({ length: CONCURRENCIA }, worker));

const archivo = `prueba-google-${origen.slug}.json`;
writeFileSync(
  archivo,
  JSON.stringify({ origen: origen.id, prueba: prueba.id, creado: new Date().toISOString(), fotos: correspondencia }, null, 1),
);

console.log(
  `\nListo: ${hechas} fotos copiadas${fallidas ? `, ${fallidas} fallaron` : ""}.\n` +
    `Correspondencia copia → original en ${archivo}\n` +
    `Panel: /admin/colecciones/${prueba.id}  →  "Dorsales con Google Vision (prueba)"`,
);
await db.$disconnect();
