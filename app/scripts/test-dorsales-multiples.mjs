/**
 * Tests de fotos con varios dorsales (src/lib/bib.ts y src/lib/pricing.ts).
 *
 * El bug: `bibNumber` guarda todos los dorsales de la foto separados por coma
 * ("1559,1734,6108") y la búsqueda y el cálculo por persona comparaban el
 * valor entero. En MARATON COLEGIO DE ABOGADOS eso dejaba a 867 de 1015
 * corredores sin ninguna foto al buscar su número, y cobraba dos packs al que
 * aparecía solo en unas fotos y acompañado en otras.
 *
 * Correr:  node scripts/test-dorsales-multiples.mjs
 */

import { execSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(process.cwd(), ".test-build");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "package.json"), JSON.stringify({ type: "module" }));
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
    },
    files: ["../src/lib/bib.ts", "../src/lib/pricing.ts"],
  }),
);
execSync(`npx tsc -p "${join(out, "tsconfig.json")}"`, { stdio: "inherit" });
// tsc deja el import relativo sin extensión ("./bib"); Node ESM la necesita.
const pricingJs = join(out, "pricing.js");
writeFileSync(
  pricingJs,
  (await import("node:fs")).readFileSync(pricingJs, "utf8").replace(/from "\.\/bib"/g, 'from "./bib.js"'),
);

const bib = await import(pathToFileURL(join(out, "bib.js")).href);
const pricing = await import(pathToFileURL(pricingJs).href);

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond ? "" : `  → ${detalle}`}`);
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const F = (id, bibNumber, price = null) => ({ id, bibNumber, price });

// ── bibsDe / formatearDorsales / filtroDorsal ────────────────────────────────
console.log("── bibsDe");
ok("separa por coma", igual(bib.bibsDe("1559,1734,6108"), ["1559", "1734", "6108"]));
ok("normaliza cada uno y quita repetidos", igual(bib.bibsDe("0042, 42 ,#7"), ["42", "7"]));
ok("null y vacío dan lista vacía", igual(bib.bibsDe(null), []) && igual(bib.bibsDe(" , "), []));
ok("formato largo", bib.formatearDorsales("1559,1734") === "#1559 · #1734");
ok("formato corto para la miniatura", bib.formatearDorsales("1559,1734,6108", 1) === "#1559 +2");
ok("filtroDorsal cubre las 4 posiciones",
  igual(bib.filtroDorsal("15").OR.map((c) => c.bibNumber), ["15", { startsWith: "15," }, { endsWith: ",15" }, { contains: ",15," }]));

// ── buscarDorsal ─────────────────────────────────────────────────────────────
console.log("\n── buscarDorsal");
const valores = ["1559,1734,6108", "1559", "6559", "0042", "1734,20", "10", "1986,109,21,10,2025"];
{
  const r = bib.buscarDorsal("1559", valores);
  ok("encuentra el dorsal dentro de un valor múltiple (el bug)",
    igual(r.exactos.sort(), ["1559", "1559,1734,6108"]), JSON.stringify(r.exactos));
  ok("con coincidencia exacta no sugiere parecidos de confianza baja (6559)",
    !r.parecidos.some((p) => p.bib === "6559"), JSON.stringify(r.parecidos));
}
ok("un dorsal que sólo existe acompañado se encuentra",
  igual(bib.buscarDorsal("6108", valores).exactos, ["1559,1734,6108"]));
ok("un dorsal en el medio de la lista se encuentra",
  igual(bib.buscarDorsal("21", valores).exactos, ["1986,109,21,10,2025"]));
ok("ceros a la izquierda siguen siendo el mismo dorsal",
  igual(bib.buscarDorsal("42", valores).exactos, ["0042"]));
ok("15 no arrastra a 1559 (no es substring)",
  bib.buscarDorsal("15", valores).exactos.length === 0);
{
  const r = bib.buscarDorsal("1735", valores);
  ok("sin exacto, sugiere el parecido que vive dentro de un valor múltiple",
    r.parecidos.some((p) => p.bib === "1734" && p.valores.includes("1559,1734,6108")), JSON.stringify(r.parecidos));
}

// ── asignarPersonas ──────────────────────────────────────────────────────────
console.log("\n── asignarPersonas");
{
  const elegidas = [F("a", "1559,1734"), F("b", "1559"), F("c", "10,1559")];
  const p = pricing.asignarPersonas(elegidas);
  ok("sin preferidos, gana el dorsal que más se repite entre las elegidas",
    [...p.values()].every((v) => v === "1559"), JSON.stringify([...p]));
}
{
  const p = pricing.asignarPersonas([F("a", "1559,1734")], ["1734"]);
  ok("en una foto sola, el dorsal buscado decide", p.get("a") === "1734");
}
{
  const p = pricing.asignarPersonas([F("a", "1559,1734")], ["9999"]);
  ok("un preferido que la foto no tiene no la cambia de dueño", p.get("a") === "1559");
}
{
  const p = pricing.asignarPersonas([F("a", null)]);
  ok("sin dorsal va al grupo sin-dorsal", p.get("a") === pricing.CLAVE_SIN_DORSAL);
}

// ── armarCompra: alcance, personas, tramo ────────────────────────────────────
console.log("\n── armarCompra");
const todas = [
  F("a", "1559,1734"), F("b", "1559"), F("c", "1559,6000"), F("d", "1734"), F("e", "6000"), F("f", "9"),
];
{
  const c = pricing.armarCompra([F("a", "1559,1734")], todas, ["1559"]);
  ok("el alcance son todas las fotos donde aparece la persona, solo o acompañado",
    igual(c.alcance.map((x) => x.id).sort(), ["a", "b", "c"]), JSON.stringify(c.alcance.map((x) => x.id)));
  ok("una sola persona", c.claves.size === 1 && igual(c.dorsales, ["1559"]));
  ok("cuenta 3 fotos para el tramo", c.fotosPorPersona.get("1559") === 3);
}
{
  // LA REGRESIÓN DEL PACK: antes "1559" y "1559,1734" eran dos personas.
  const c = pricing.armarCompra([F("b", "1559"), F("a", "1559,1734")], todas);
  ok("mismo corredor solo y acompañado = UNA persona = un pack (antes cobraba dos)",
    c.claves.size === 1 && pricing.calcularPack(1000, c.claves.size) === 1000, JSON.stringify([...c.claves]));
}
{
  const c = pricing.armarCompra([F("b", "1559"), F("d", "1734")], todas);
  ok("dos corredores distintos siguen siendo dos packs", c.claves.size === 2);
}
{
  // Pack: el cliente manda el alcance entero como elegidas. El servidor tiene
  // que llegar a la misma persona y al mismo alcance.
  const cliente = pricing.armarCompra([F("a", "1559,1734")], todas, ["1559"]);
  const servidor = pricing.armarCompra(cliente.alcance, todas, ["1559"]);
  ok("el pack recalculado en el servidor da lo mismo que en el cliente",
    igual(servidor.dorsales, cliente.dorsales) &&
      igual(servidor.alcance.map((x) => x.id).sort(), cliente.alcance.map((x) => x.id).sort()));
}

{
  // Dos amigos que salen juntos en TODAS las fotos, guardados en distinto orden.
  // El cliente compra una; el pack manda el alcance y el servidor recalcula.
  const amigos = [F("p", "1559,1734"), F("q", "1734,1559"), F("r", "1734,1559"), F("s", "1559,1734")];
  for (const pref of [[], ["1734"], ["1559", "1734"]]) {
    const cliente = pricing.armarCompra([F("q", "1734,1559")], amigos, pref);
    const servidor = pricing.armarCompra(cliente.alcance, amigos, pref);
    ok(`amigos siempre juntos, preferidos=${JSON.stringify(pref)}: una persona en el cliente y en el servidor`,
      cliente.claves.size === 1 && servidor.claves.size === 1 && igual(servidor.dorsales, cliente.dorsales),
      `cliente=${JSON.stringify(cliente.dorsales)} servidor=${JSON.stringify(servidor.dorsales)}`);
  }
  ok("y el dorsal buscado es el que queda",
    igual(pricing.armarCompra([F("q", "1734,1559")], amigos, ["1734"]).dorsales, ["1734"]));
}

// ── calcularTotal por persona ────────────────────────────────────────────────
console.log("\n── calcularTotal");
{
  const tiers = [{ minQty: 3, priceEach: 800 }];
  const elegidas = [F("b", "1559"), F("a", "1559,1734")];
  const c = pricing.armarCompra(elegidas, todas, ["1559"]);
  const total = pricing.calcularTotal(elegidas, c, 1000, tiers);
  ok("el tramo cuenta las 3 fotos de la persona, también las acompañadas (2 × 800)",
    total === 1600, `dio ${total}`);
}
{
  const tiers = [{ minQty: 3, priceEach: 800 }];
  const elegidas = [F("f", "9")];
  const c = pricing.armarCompra(elegidas, todas);
  ok("otra persona con una sola foto paga el precio base", pricing.calcularTotal(elegidas, c, 1000, tiers) === 1000);
}
{
  const elegidas = [F("b", "1559", 500)];
  const c = pricing.armarCompra(elegidas, todas);
  ok("el precio propio de una foto sigue mandando", pricing.calcularTotal(elegidas, c, 1000, []) === 500);
}

rmSync(out, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTODOS LOS TESTS PASAN" : `\n${fallos} TESTS FALLARON`);
process.exit(fallos === 0 ? 0 : 1);
