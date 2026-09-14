/**
 * Tests de la extracción de dorsales (src/lib/dorsal.ts) y del armado de
 * líneas de Google Vision (src/lib/ocr-google.ts).
 *
 * Los casos salen de detecciones reales de Rekognition sobre el álbum
 * DOWNHILL 4TO ROUND PAN DE AZUCAR (2026-09-14): son los que el filtro viejo
 * descartaba y los falsos positivos que aceptaba.
 *
 * Correr:  node scripts/test-dorsal.mjs
 */

import { execSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(process.cwd(), ".test-build");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// `paths` sólo se acepta desde un tsconfig, no por línea de comandos. El alias
// `~/` se usa únicamente en un import de tipos, así que el JS emitido no lo
// necesita en tiempo de ejecución.
writeFileSync(
  join(out, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      outDir: ".",
      rootDir: "../src/lib",
      module: "esnext",
      target: "es2022",
      moduleResolution: "bundler",
      skipLibCheck: true,
      baseUrl: "..",
      paths: { "~/*": ["src/*"] },
    },
    files: ["../src/lib/dorsal.ts", "../src/lib/ocr-google.ts"],
  }),
);
execSync(`npx tsc -p "${join(out, "tsconfig.json")}"`, { stdio: "inherit" });

const { placaDeLinea, extraerDorsales } = await import(pathToFileURL(join(out, "dorsal.js")).href);
const { lineasDeVision } = await import(pathToFileURL(join(out, "ocr-google.js")).href);

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond ? "" : `  → ${detalle}`}`);
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── placaDeLinea ─────────────────────────────────────────────────────────────
console.log("── placaDeLinea");
const placas = [
  ["1", "1"], ["8", "8"], ["42", "42"], ["#42", "42"], ["0120H", "120"], ["120H", "120"],
  ["150th", "150"], ["24H", "24"], ["B62", "862"], ["0095", "95"], ["1296", "1296"],
  ["100%", null], ["12:34", null], ["10 KM", null], ["2CUMBRES.COM.AR", null],
  ["2 CUMBRES", null], ["F541", null], ["0", null], ["81051", null], ["", null], ["$72", null],
];
for (const [entrada, esperado] of placas) {
  const r = placaDeLinea(entrada);
  ok(`"${entrada}" → ${JSON.stringify(esperado)}`, r === esperado, `dio ${JSON.stringify(r)}`);
}

// ── extraerDorsales, casos reales ────────────────────────────────────────────
console.log("\n── extraerDorsales");
const L = (texto, confianza) => ({ texto, confianza });
const casos = [
  ["placa con barro, confianza 37", [L("248", 37.8), L("XU3", 16)], ["248"]],
  ["un dígito, el primero de la general", [L("1", 89.6), L("SAN TOCK", 54.7)], ["1"]],
  ["sticker de categoría pegado", [L("FOX", 94.9), L("0120H", 80.8)], ["120"]],
  ["letra confundible al principio", [L("Pay", 77.4), L("B62", 92.1)], ["862"]],
  ["sponsor 2 CUMBRES no es dorsal, la placa 24H sí", [L("2 CUMBRES", 95.2), L("24H", 29.4)], ["24"]],
  ["la placa le gana al número suelto aunque tenga menos confianza", [L("FR 541", 86.5), L("8", 97.3)], ["8", "541"]],
  ["logo 100% presente: el 100 suelto no cuenta, el 5 sí", [L("100%", 95), L("5", 53), L("-14-9", 25.8)], ["5"]],
  ["logo 100% presente: 10 sigue valiendo", [L("100%", 91.4), L("10", 93.5)], ["10"]],
  ["100 aislado sin logo se acepta", [L("100", 90)], ["100"]],
  ["número suelto en frase con confianza alta", [L("SSIMS 10", 80)], ["10"]],
  ["número suelto en frase con confianza baja no entra", [L("SSIMS 10", 40)], []],
  ["placa con confianza menor a 25 no entra", [L("$72", 21.4), L("83EF", 20)], []],
  ["texto sin dígitos", [L("SAN ROCK", 98.4), L("RPM", 91.4)], []],
  ["dos placas: manda la confianza", [L("560", 70), L("91", 95)], ["91", "560"]],
  ["ceros a la izquierda normalizados y sin duplicar", [L("095", 60), L("95", 80)], ["95"]],
  ["hora y km excluidos", [L("12:34", 99), L("45 km", 99)], []],
];
for (const [nombre, lineas, esperado] of casos) {
  const r = extraerDorsales(lineas);
  ok(nombre, igual(r, esperado), `dio ${JSON.stringify(r)}, esperaba ${JSON.stringify(esperado)}`);
}

// ── lineasDeVision ───────────────────────────────────────────────────────────
console.log("\n── lineasDeVision");
const simbolo = (text, confidence, corte) => ({
  text,
  confidence,
  ...(corte ? { property: { detectedBreak: { type: corte } } } : {}),
});
const anotacion = {
  pages: [{
    blocks: [{
      paragraphs: [
        {
          words: [
            { symbols: [simbolo("1", 0.9), simbolo("2", 0.8), simbolo("0", 0.7, "EOL_SURE_SPACE")] },
            { symbols: [simbolo("F", 0.99), simbolo("O", 0.99), simbolo("X", 0.99, "LINE_BREAK")] },
          ],
        },
        {
          words: [
            { symbols: [simbolo("2", 0.95, "SPACE")] },
            { symbols: [simbolo("C", 0.9), simbolo("U", 0.9), simbolo("M", 0.9)] },
          ],
        },
      ],
    }],
  }],
};
const lineas = lineasDeVision(anotacion);
ok("tres líneas: 120 / FOX / 2 CUM", igual(lineas.map((l) => l.texto), ["120", "FOX", "2 CUM"]), JSON.stringify(lineas));
ok("confianza promedio en 0-100", lineas[0]?.confianza === 80 && lineas[1]?.confianza === 99, JSON.stringify(lineas));
ok("sin anotación devuelve vacío", igual(lineasDeVision(undefined), []));
ok("las líneas de Vision alimentan el mismo extractor", igual(extraerDorsales(lineas), ["120"]), JSON.stringify(extraerDorsales(lineas)));

rmSync(out, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTODOS LOS TESTS PASAN" : `\n${fallos} TESTS FALLARON`);
process.exit(fallos === 0 ? 0 : 1);
