/**
 * Limpia `faceAttemptedAt` para que las fotos vuelvan a pasar por el indexado
 * facial. Correr DESPUÉS de desplegar el cambio de QualityFilter.
 *
 * Por qué hace falta: hasta ahora se indexaba con el QualityFilter por defecto
 * ("AUTO"), que descarta caras chicas o poco nítidas antes de guardarlas.
 * Medido sobre fotos reales de downhill, tiraba 5 de 8 caras detectadas con
 * 88-100 de confianza. Esas fotos quedaron marcadas como "ya intentadas" y con
 * pocas caras —o ninguna—, así que no se reintentarían solas.
 *
 * Sólo toca fotos SIN ninguna cara indexada. Las que ya tienen caras se dejan
 * como están: reindexarlas se paga de nuevo y duplica las caras en Rekognition,
 * porque cada IndexFaces devuelve FaceIds nuevos.
 *
 *   node scripts/reset-face-attempted.mjs                    # dry run, todas
 *   node scripts/reset-face-attempted.mjs --aplicar
 *   node scripts/reset-face-attempted.mjs --coleccion=<id> --aplicar
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
const coleccion = process.argv
  .find((a) => a.startsWith("--coleccion="))
  ?.split("=")[1];

const where = {
  faceAttemptedAt: { not: null },
  faceRecords: { none: {} },
  ...(coleccion ? { collectionId: coleccion } : {}),
};

const afectadas = await db.photo.count({ where });
const conCaras = await db.photo.count({
  where: {
    faceRecords: { some: {} },
    ...(coleccion ? { collectionId: coleccion } : {}),
  },
});

console.log(coleccion ? `colección: ${coleccion}` : "todas las colecciones");
console.log(`fotos ya intentadas y SIN caras (se reintentarían): ${afectadas}`);
console.log(`fotos con caras ya indexadas (NO se tocan)        : ${conCaras}`);

if (afectadas === 0) {
  console.log("\nNada que hacer.");
  await db.$disconnect();
  process.exit(0);
}

if (!APLICAR) {
  console.log("\nDry run. Volvé a correr con --aplicar para limpiar la marca.");
  console.log("Después, en el admin: Reprocesar pendientes → Indexar rostros.");
  await db.$disconnect();
  process.exit(0);
}

const { count } = await db.photo.updateMany({
  where,
  data: { faceAttemptedAt: null },
});

console.log(`\n${count} fotos vuelven a la cola de indexado.`);
console.log("Ahora, en el admin: Reprocesar pendientes → Indexar rostros.");

await db.$disconnect();
