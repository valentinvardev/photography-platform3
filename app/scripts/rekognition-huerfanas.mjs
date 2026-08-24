/**
 * Lista las colecciones de Rekognition que ya no tienen una Collection en la DB
 * y, opcionalmente, las borra.
 *
 * Las caras guardadas se facturan por mes y para siempre. Una colección de un
 * evento borrado hace un año se sigue pagando aunque nadie la consulte nunca.
 * El arreglo en collection.delete evita que se sigan acumulando; esto limpia
 * las que ya quedaron.
 *
 *   node scripts/rekognition-huerfanas.mjs           # dry run, no borra nada
 *   node scripts/rekognition-huerfanas.mjs --borrar  # borra de verdad
 *
 * Requiere en la política IAM: rekognition:ListCollections, DescribeCollection
 * y DeleteCollection.
 */

import { readFileSync } from "node:fs";
import {
  RekognitionClient,
  ListCollectionsCommand,
  DescribeCollectionCommand,
  DeleteCollectionCommand,
} from "@aws-sdk/client-rekognition";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (m) process.env[m[1]] ??= m[2];
}

const { PrismaClient } = await import("../generated/prisma/index.js");
const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

const rek = new RekognitionClient({
  region: process.env.AWS_REGION ?? "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BORRAR = process.argv.includes("--borrar");
const PRECIO_POR_CARA_MES = 0.00001;

// Todas las colecciones Rekognition de la cuenta (paginado)
const todas = [];
let token;
do {
  const res = await rek.send(new ListCollectionsCommand({ NextToken: token, MaxResults: 100 }));
  todas.push(...(res.CollectionIds ?? []));
  token = res.NextToken;
} while (token);

// Las que corresponden a colecciones vivas en ESTA base
const vivas = new Set(
  (await db.collection.findMany({ select: { id: true } })).map(
    (c) => `foto-${c.id.replace(/[^a-zA-Z0-9_.\-]/g, "-")}`,
  ),
);

console.log(`colecciones en Rekognition : ${todas.length}`);
console.log(`colecciones vivas en la DB : ${vivas.size}`);

const huerfanas = todas.filter((c) => c.startsWith("foto-") && !vivas.has(c));
const ajenas = todas.filter((c) => !c.startsWith("foto-"));

if (ajenas.length) {
  console.log(`\nNo empiezan con "foto-" — probablemente de otra plataforma, NO se tocan:`);
  for (const c of ajenas) console.log(`  ${c}`);
}

if (huerfanas.length === 0) {
  console.log("\nSin colecciones huérfanas.");
  await db.$disconnect();
  process.exit(0);
}

console.log(`\nHuérfanas (${huerfanas.length}):`);
let carasTotal = 0;
for (const c of huerfanas) {
  let caras = 0;
  try {
    const d = await rek.send(new DescribeCollectionCommand({ CollectionId: c }));
    caras = d.FaceCount ?? 0;
  } catch {
    // sin permiso de Describe o colección ya borrada
  }
  carasTotal += caras;
  console.log(`  ${c}  ${caras} caras`);
}

console.log(
  `\n${carasTotal} caras = USD ${(carasTotal * PRECIO_POR_CARA_MES).toFixed(2)}/mes, para siempre.`,
);

if (!BORRAR) {
  console.log("\nDry run. Volvé a correr con --borrar para eliminarlas.");
  await db.$disconnect();
  process.exit(0);
}

// OJO: es irreversible. Borrar una colección implica reindexar desde cero si
// alguna vez se necesita la búsqueda por selfie de ese evento.
for (const c of huerfanas) {
  try {
    await rek.send(new DeleteCollectionCommand({ CollectionId: c }));
    console.log(`borrada: ${c}`);
  } catch (err) {
    console.error(`falló ${c}:`, err.name ?? err);
  }
}

await db.$disconnect();
