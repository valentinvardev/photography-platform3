/**
 * Genera la marca de agua de todas las fotos que no la tienen.
 *
 * Corre solo, en el servidor. No pasa por el navegador, ni por HTTP, ni por el
 * proxy, ni por Next: son justo las piezas que venían rompiendo el reprocesado
 * desde el panel. Acá sólo hay base de datos, S3 y sharp.
 *
 *   cd ~/sinchifoto/app
 *   node scripts/regenerar-watermarks.mjs --dry            # sin escribir nada
 *   node scripts/regenerar-watermarks.mjs                  # sólo las que no tienen preview
 *   node scripts/regenerar-watermarks.mjs --coleccion=<id>
 *   node scripts/regenerar-watermarks.mjs --concurrencia=8
 *
 * Cuando el preview EXISTE pero salió sin la marca encima —pasaba si no se
 * podía bajar el PNG de la marca y entraba el texto translúcido de respaldo—
 * hay dos modos más:
 *
 *   --verificar   baja cada preview, mide si tiene la marca, y rehace sólo los
 *                 que no la tienen. Un preview pesa ~200 KB contra 4,4 MB del
 *                 original, así que revisar sale mucho más barato que rehacer.
 *   --forzar      rehace todos, tengan o no la marca. Es el martillo.
 *
 *   node scripts/regenerar-watermarks.mjs --coleccion=<id> --verificar
 *   node scripts/regenerar-watermarks.mjs --coleccion=<id> --forzar
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
const FORZAR = process.argv.includes("--forzar");
const VERIFICAR = process.argv.includes("--verificar");
const COLECCION = arg("coleccion", null);
const CONCURRENCIA = Number(arg("concurrencia", "6"));
const LOTE = 50;

/**
 * Cuánto amarillo saturado tiene que tener un preview para considerarlo
 * marcado. La marca de SINCHI es #FFE600 embaldosado y da 4-8% medido sobre
 * previews reales; el texto translúcido de respaldo no llega a nada de eso.
 * El umbral está bien por debajo de lo medido para no rehacer de más.
 */
const UMBRAL_AMARILLO = 0.015;

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

/**
 * Fracción de píxeles de amarillo saturado. Sirve para distinguir un preview
 * con la marca de SINCHI de uno que salió con el texto de respaldo.
 */
async function amarillez(buf) {
  const { data, info } = await sharp(buf)
    .resize({ width: 400 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let amarillos = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 190 && g > 170 && b < 110 && r - b > 110) amarillos++;
  }
  return amarillos / (info.width * info.height);
}

/** ¿El preview que ya está subido tiene la marca? */
async function yaTieneMarca(previewKey) {
  try {
    const buf = await bajar(previewKey);
    return (await amarillez(buf)) >= UMBRAL_AMARILLO;
  } catch {
    // Si no se puede leer, se rehace: es más barato que dejar una sin marca.
    return false;
  }
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

// Se puede indicar el evento por nombre en vez de por id, que es más fácil de
// copiar bien desde el admin.
const EVENTO = arg("evento", null);
let coleccionId = COLECCION;

if (EVENTO) {
  const encontradas = await db.collection.findMany({
    where: { title: { contains: EVENTO, mode: "insensitive" } },
    select: { id: true, title: true, _count: { select: { photos: true } } },
  });
  if (encontradas.length === 0) {
    console.error(`No hay ningún evento que contenga "${EVENTO}".`);
    await db.$disconnect();
    process.exit(1);
  }
  if (encontradas.length > 1) {
    console.error(`"${EVENTO}" coincide con varios eventos. Usá --coleccion=<id>:`);
    for (const c of encontradas) console.error(`   ${c.id}  ${c.title} (${c._count.photos} fotos)`);
    await db.$disconnect();
    process.exit(1);
  }
  coleccionId = encontradas[0].id;
  console.log(`evento: "${encontradas[0].title}"  (${coleccionId})`);
}

// En modo normal sólo interesan las que no tienen preview. Con --forzar o
// --verificar hay que mirar todas, porque el preview existe y el problema está
// adentro del archivo.
const revisarTodas = FORZAR || VERIFICAR;
const where = {
  ...(revisarTodas ? {} : { previewKey: null }),
  ...(coleccionId ? { collectionId: coleccionId } : {}),
};

/**
 * Barrera contra correrlo sobre la plataforma equivocada.
 *
 * El bucket está compartido entre varias plataformas, separadas por prefijo
 * (`raulsinchi/`, `ivana/`). La base, en cambio, es distinta para cada una. Si
 * el .env tiene el DATABASE_URL de una y el AWS_S3_PREFIX de otra —cosa que
 * pasa fácil copiando archivos entre entornos— este script escribiría previews
 * de un cliente encima del bucket de otro.
 *
 * Se compara el prefijo real de las fotos de la base contra el configurado, y
 * ante cualquier desacuerdo se corta antes de tocar nada.
 */
const muestra = await db.photo.findMany({
  where: coleccionId ? { collectionId: coleccionId } : {},
  select: { storageKey: true },
  take: 20,
});
const prefijosReales = [...new Set(muestra.map((p) => p.storageKey.split("/")[0] + "/"))];
const esperado = PREFIJO || "(sin prefijo)";

if (prefijosReales.length > 0 && !prefijosReales.includes(PREFIJO)) {
  console.error(`\n✗ PARÁ. La base y el bucket no son de la misma plataforma.`);
  console.error(`   AWS_S3_PREFIX configurado : ${esperado}`);
  console.error(`   prefijo de las fotos      : ${prefijosReales.join(", ")}`);
  console.error(`\n   Escribir así dejaría previews de un cliente en la carpeta de otro.`);
  console.error(`   Revisá que DATABASE_URL y AWS_S3_PREFIX del .env sean del mismo lado.`);
  await db.$disconnect();
  process.exit(1);
}

const total = await db.photo.count({ where });
const modo = FORZAR
  ? "REHACER TODAS"
  : VERIFICAR
    ? "verificar y rehacer las que no tengan marca"
    : "sólo las que no tienen preview";
console.log(
  `${total} fotos a revisar${COLECCION ? ` en ${COLECCION}` : " (todas las colecciones)"}` +
    `  ·  modo: ${modo}${DRY ? "  [DRY RUN, no escribe nada]" : ""}\n`,
);

if (total === 0) {
  await db.$disconnect();
  process.exit(0);
}

let hechas = 0;
let fallidas = 0;
let yaEstaban = 0;
let vistas = 0;
const arranque = Date.now();
const tiempos = { bajada: 0, imagen: 0, subida: 0 };

// Cursor sobre `order`, más las ya vistas en memoria. Con --forzar y
// --verificar la foto no sale del filtro al procesarla, así que sin cursor el
// lote traería las mismas cincuenta para siempre. `order` no es único —lo
// calcula un count() que bajo concurrencia repite— por eso va con `gte` y se
// descartan las repetidas en vez de avanzar con `gt`, que saltearía fotos.
let desdeOrden = 0;
const yaVistas = new Set();

for (;;) {
  const crudo = await db.photo.findMany({
    where: { ...where, order: { gte: desdeOrden } },
    select: { id: true, storageKey: true, filename: true, previewKey: true, order: true },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    take: LOTE,
  });
  if (crudo.length === 0) break;

  const lote = crudo.filter((p) => !yaVistas.has(p.id));
  if (lote.length === 0) {
    desdeOrden = crudo[crudo.length - 1].order + 1;
    continue;
  }

  let siguiente = 0;
  const worker = async () => {
    while (siguiente < lote.length) {
      const foto = lote[siguiente++];
      yaVistas.add(foto.id);
      if (foto.order > desdeOrden) desdeOrden = foto.order;
      vistas++;

      try {
        // En modo verificar se mira el preview antes de rehacerlo: bajar
        // ~200 KB para comprobar sale mucho más barato que bajar 4,4 MB y
        // reprocesar una foto que ya estaba bien.
        if (VERIFICAR && foto.previewKey && (await yaTieneMarca(foto.previewKey))) {
          yaEstaban++;
          if (vistas % 25 === 0) {
            console.log(`[${String(vistas).padStart(4)}/${total}] ${yaEstaban} ya tenían marca, ${hechas} rehechas`);
          }
          continue;
        }

        if (DRY) {
          hechas++;
          console.log(`[${String(vistas).padStart(4)}/${total}] ${foto.filename.slice(-28)}  -> se rehace`);
          continue;
        }

        const t = await procesar(foto);
        hechas++;
        tiempos.bajada += t.msBajada;
        tiempos.imagen += t.msImagen;
        tiempos.subida += t.msSubida;
        const transcurrido = (Date.now() - arranque) / 1000;
        const eta = vistas > 0 ? Math.ceil(((total - vistas) * (transcurrido / vistas)) / 60) : "?";
        console.log(
          `[${String(vistas).padStart(4)}/${total}] ${foto.filename.slice(-28).padEnd(28)} ` +
            `bajada ${String(t.msBajada).padStart(6)}ms  imagen ${String(t.msImagen).padStart(5)}ms  ` +
            `subida ${String(t.msSubida).padStart(5)}ms   faltan ~${eta} min`,
        );
      } catch (err) {
        fallidas++;
        console.error(`[${String(vistas).padStart(4)}/${total}] FALLÓ ${foto.id}: ${err.name} ${err.message?.slice(0, 90)}`);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCIA, lote.length) }, worker),
  );
}

const seg = (Date.now() - arranque) / 1000;
console.log(`\n── listo en ${(seg / 60).toFixed(1)} min`);
console.log(`   revisadas ${vistas}   rehechas ${hechas}   fallidas ${fallidas}` +
  (VERIFICAR ? `   ya tenían marca ${yaEstaban}` : ""));
if (hechas > 0) {
  console.log(
    `   promedio por foto: bajada ${Math.round(tiempos.bajada / hechas)}ms · ` +
      `imagen ${Math.round(tiempos.imagen / hechas)}ms · subida ${Math.round(tiempos.subida / hechas)}ms`,
  );
}

await db.$disconnect();
