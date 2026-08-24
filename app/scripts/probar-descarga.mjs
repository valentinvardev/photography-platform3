/**
 * Mide cuánto tarda este servidor en bajar una foto del bucket, por los dos
 * caminos: CloudFront y S3 directo.
 *
 * Es el dato que falta para decidir qué hacer con la marca de agua. Todo lo
 * demás —OCR, dorsales, rostros— dejó de depender de esto cuando pasamos a que
 * Rekognition leyera de S3 por su cuenta. La marca de agua no puede: sharp
 * necesita los píxeles acá.
 *
 *   node scripts/probar-descarga.mjs
 *
 * Cómo leer el resultado:
 *   ~1-2 s      el servidor baja bien; el problema es otro
 *   ~10-40 s    la red del VPS a AWS es el cuello -> conviene mover el
 *               watermark a la Lambda, que corre dentro de AWS
 *   se cuelga   no hay ajuste que alcance; hay que mover el trabajo a AWS
 */

import { readFileSync } from "node:fs";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (m) process.env[m[1]] ??= m[2];
}

const BUCKET = process.env.AWS_S3_BUCKET;
const PREFIJO = (process.env.AWS_S3_PREFIX ?? "").replace(/\/?$/, "/");
const CF = process.env.CLOUDFRONT_DOMAIN;
const TOPE_MS = 60_000;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

console.log(`bucket : ${BUCKET}`);
console.log(`region : ${process.env.AWS_REGION}`);
console.log(`cf     : ${CF ?? "(sin CloudFront)"}\n`);

const lista = await s3.send(
  new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `${PREFIJO}uploads/`, MaxKeys: 12 }),
);
const candidatas = (lista.Contents ?? []).filter((o) => o.Size > 1_000_000).slice(0, 3);

if (candidatas.length === 0) {
  console.log("No encontré fotos para probar bajo", `${PREFIJO}uploads/`);
  process.exit(1);
}

const mb = (n) => (n / 1e6).toFixed(2);
const resumen = { cf: [], s3: [] };

for (const objeto of candidatas) {
  console.log(`── ${objeto.Key.split("/").pop()} (${mb(objeto.Size)}MB)`);

  if (CF) {
    const t = Date.now();
    try {
      const res = await fetch(`https://${CF}/${objeto.Key}`, {
        signal: AbortSignal.timeout(TOPE_MS),
      });
      const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
      const ms = Date.now() - t;
      if (buf) {
        resumen.cf.push(ms);
        console.log(`   CloudFront  ${String(ms).padStart(6)} ms   ${(buf.length / 1e6 / (ms / 1000)).toFixed(1)} MB/s`);
      } else {
        console.log(`   CloudFront  HTTP ${res.status}`);
      }
    } catch (err) {
      console.log(`   CloudFront  FALLÓ (${err.name}) tras ${Date.now() - t} ms`);
    }
  }

  const t2 = Date.now();
  try {
    const g = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: objeto.Key }), {
      abortSignal: AbortSignal.timeout(TOPE_MS),
    });
    const trozos = [];
    for await (const x of g.Body) trozos.push(x);
    const ms = Date.now() - t2;
    resumen.s3.push(ms);
    console.log(`   S3 directo  ${String(ms).padStart(6)} ms   ${(Buffer.concat(trozos).length / 1e6 / (ms / 1000)).toFixed(1)} MB/s`);
  } catch (err) {
    console.log(`   S3 directo  FALLÓ (${err.name}) tras ${Date.now() - t2} ms`);
  }
}

const promedio = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
const pCf = promedio(resumen.cf);
const pS3 = promedio(resumen.s3);

console.log("\n── promedios");
console.log(`   CloudFront : ${pCf === null ? "no funcionó" : pCf + " ms"}`);
console.log(`   S3 directo : ${pS3 === null ? "no funcionó" : pS3 + " ms"}`);

const mejor = [pCf, pS3].filter((x) => x !== null).sort((a, b) => a - b)[0];
if (mejor === undefined) {
  console.log("\n=> Este servidor NO puede bajar del bucket. El watermark tiene que");
  console.log("   correr dentro de AWS (Lambda). No hay ajuste que lo arregle.");
} else if (mejor < 3000) {
  console.log(`\n=> La descarga anda bien (${mejor} ms). Con concurrencia 6, las 736`);
  console.log(`   fotos salen en ~${Math.ceil((736 * (mejor + 400)) / 6 / 60000)} min. No hace falta mover nada.`);
} else {
  console.log(`\n=> La descarga es el cuello (${mejor} ms por foto). Las 736 tardarían`);
  console.log(`   ~${Math.ceil((736 * (mejor + 400)) / 6 / 60000)} min. Conviene mover el watermark a la Lambda.`);
}
