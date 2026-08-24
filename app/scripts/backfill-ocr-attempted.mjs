/**
 * Backfill de `ocrAttemptedAt`. CORRER UNA VEZ, justo después del `db push`
 * que agrega la columna, y ANTES de tocar el botón "Reconocer dorsales".
 *
 * Por qué hace falta: la columna nueva arranca en NULL para todas las fotos.
 * El botón de reconocimiento busca exactamente eso — `ocrAttemptedAt IS NULL` —
 * así que sin backfill consideraría "nunca procesada" a CADA foto de la base,
 * incluidas las miles que ya se procesaron bien y simplemente no tenían un
 * dorsal visible. Serían llamadas a Rekognition pagas de nuevo, a USD 0,001
 * cada una, para volver a no encontrar nada.
 *
 * Toda foto que ya existe pasó por bulkAdd, que siempre corrió OCR en la
 * subida. Por eso `createdAt` es una marca de intento fiel.
 *
 *   node scripts/backfill-ocr-attempted.mjs          # dry run
 *   node scripts/backfill-ocr-attempted.mjs --aplicar
 */

import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (m) process.env[m[1]] ??= m[2];
}

const { PrismaClient } = await import("../generated/prisma/index.js");
const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

const APLICAR = process.argv.includes("--aplicar");

const total = await db.photo.count();
const pendientes = await db.photo.count({ where: { ocrAttemptedAt: null } });
const conDorsal = await db.photo.count({
  where: { ocrAttemptedAt: null, bibNumber: { not: null } },
});

console.log(`fotos en la base                    : ${total}`);
console.log(`con ocrAttemptedAt en NULL          : ${pendientes}`);
console.log(`  de esas, con dorsal ya detectado  : ${conDorsal}`);
console.log(
  `\nsi no se hace el backfill, el boton reprocesaria ${pendientes} fotos` +
    ` = USD ${(pendientes * 0.001).toFixed(2)}`,
);

if (pendientes === 0) {
  console.log("\nNada que hacer.");
  await db.$disconnect();
  process.exit(0);
}

if (!APLICAR) {
  console.log("\nDry run. Volvé a correr con --aplicar para escribir.");
  await db.$disconnect();
  process.exit(0);
}

// Se marca el intento con la fecha de subida, que es cuando bulkAdd corrió OCR.
const { count } = await db.$executeRawUnsafe(`
  UPDATE "Photo" SET "ocrAttemptedAt" = "createdAt" WHERE "ocrAttemptedAt" IS NULL
`).then((n) => ({ count: n }));

console.log(`\n${count} filas actualizadas.`);
console.log(
  `quedan pendientes de OCR: ${await db.photo.count({ where: { ocrAttemptedAt: null } })}`,
);

await db.$disconnect();
