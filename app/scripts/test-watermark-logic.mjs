/**
 * Tests de la lógica que dejó fotos sin marca de agua.
 *
 * Cubren los dos lugares exactos donde vivieron los bugs:
 * - watermark-queue.ts: el muro de la ventana y los 3 intentos de por vida
 *   (la foto quedaba en lista negra hasta reiniciar pm2).
 * - s3.ts / isS3Key: el ruteo que mandaba el PNG de la marca a Supabase y hacía
 *   que TODAS las fotos salieran con el respaldo translúcido invisible.
 *
 * Correr:  node scripts/test-watermark-logic.mjs
 * (compila los módulos con tsc a un directorio temporal y los ejecuta tal cual)
 */

import { execSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Entorno determinístico ANTES de importar s3.ts (lee el prefijo al cargar).
process.env.AWS_S3_PREFIX = "raulsinchi";
process.env.AWS_REGION ??= "us-east-2";
process.env.AWS_ACCESS_KEY_ID ??= "test";
process.env.AWS_SECRET_ACCESS_KEY ??= "test";
process.env.AWS_S3_BUCKET ??= "test-bucket";
delete process.env.CLOUDFRONT_DISTRIBUTION_ID;

// Adentro del proyecto para que los imports resuelvan node_modules; se borra
// al terminar y está en .gitignore.
const out = join(process.cwd(), ".test-build");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execSync(
  `npx tsc src/lib/watermark-queue.ts src/lib/s3.ts --outDir "${out}" ` +
    `--module esnext --target es2022 --moduleResolution bundler --skipLibCheck`,
  { stdio: "inherit" },
);

const cola = await import(pathToFileURL(join(out, "watermark-queue.js")).href);
const s3 = await import(pathToFileURL(join(out, "s3.js")).href);

let fallos = 0;
const ok = (nombre, cond) => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}`);
};

// ── isS3Key: el ruteo que rompió el watermark ────────────────────────────────
console.log("── isS3Key");
ok("watermarks/ con prefijo va a S3 (el bug: iba a Supabase y el PNG volvía null)",
  s3.isS3Key("raulsinchi/watermarks/active.png") === true);
ok("watermarks/ pelado va a S3",
  s3.isS3Key("watermarks/active.png") === true);
ok("uploads/ con prefijo va a S3",
  s3.isS3Key("raulsinchi/uploads/c123/foto.jpg") === true);
ok("previews/ con prefijo va a S3",
  s3.isS3Key("raulsinchi/previews/abc-x1.jpg") === true);
ok("key estilo Supabase NO va a S3",
  s3.isS3Key("cmok123/1745-foto.jpg") === false);
ok("prefijo de otra plataforma NO va a S3 (semántica existente)",
  s3.isS3Key("ivana/uploads/x.jpg") === false);

// ── watermark-queue: backoff y el muro ───────────────────────────────────────
console.log("\n── watermark-queue");
const MIN = 60_000;
{
  const m = new Map();
  const t0 = 1_000_000;

  cola.registrarFallo(m, "a", t0);
  ok("1er fallo la aparta 1 min", m.get("a").hastaMs === t0 + MIN);
  ok("apartada aparece en idsEnEspera", cola.idsEnEspera(m, t0).includes("a"));

  ok("al vencer la espera VUELVE a la cola (el bug: quedaba fuera hasta reiniciar)",
    !cola.idsEnEspera(m, t0 + MIN + 1).includes("a"));
  ok("y la entrada vencida se poda del Map", !m.has("a"));
}
{
  const m = new Map();
  const t0 = 1_000_000;
  let t = t0;
  const esperas = [];
  for (let i = 0; i < 6; i++) {
    cola.registrarFallo(m, "b", t);
    esperas.push(m.get("b").hastaMs - t);
    t = m.get("b").hastaMs + 1;
  }
  ok("el backoff escala 1m → 5m → 15m → 60m",
    esperas[0] === MIN && esperas[1] === 5 * MIN && esperas[2] === 15 * MIN && esperas[3] === 60 * MIN);
  ok("y del 4to fallo en adelante se queda en 60m — NUNCA abandona la foto",
    esperas[4] === 60 * MIN && esperas[5] === 60 * MIN);
}
{
  const m = new Map();
  cola.registrarFallo(m, "c", 0);
  cola.registrarExito(m, "c");
  ok("el éxito limpia el historial", !m.has("c"));
}
{
  // EL MURO, versión de regresión: 900 fotos apartadas no pueden tapar la
  // consulta. idsEnEspera respeta el tope y devuelve las de espera más larga;
  // las demás vuelven antes de tiempo (reintentar de más es el lado barato).
  const m = new Map();
  for (let i = 0; i < 900; i++) cola.registrarFallo(m, `f${i}`, i); // hastaMs crecientes
  const lista = cola.idsEnEspera(m, 0, 800);
  ok("con 900 apartadas la lista notIn se acota a 800", lista.length === 800);
  ok("y quedan las de espera más larga (las más nuevas)",
    lista.includes("f899") && !lista.includes("f0"));
}
{
  // La escena real del muro: 144 fotos "agotadas" y 1 vieja jamás intentada.
  // Con el diseño viejo la vieja no entraba nunca a la ventana. Con el nuevo,
  // la consulta excluye por id a las apartadas, así que la vieja SIEMPRE es
  // candidata: acá lo simulamos comprobando que ninguna id fuera del Map
  // aparece en la lista de exclusión.
  const m = new Map();
  for (let i = 0; i < 144; i++) cola.registrarFallo(m, `nueva${i}`, 1000);
  const excluidas = new Set(cola.idsEnEspera(m, 2000));
  ok("la foto vieja jamás intentada NO está excluida (el muro no existe más)",
    !excluidas.has("vieja-jamas-intentada") && excluidas.size === 144);
}

rmSync(out, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTODOS LOS TESTS PASAN" : `\n${fallos} TESTS FALLARON`);
process.exit(fallos === 0 ? 0 : 1);
