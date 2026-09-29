/**
 * Utilidades de dorsal.
 *
 * El bibNumber se detecta por OCR sobre la foto, así que los errores típicos
 * son de lectura (un 8 leído como 0, un 7 como 1), no de tipeo: la persona que
 * busca sabe su número. Por eso la sugerencia de "números parecidos" se apoya
 * en pares confundibles y no en cualquier diferencia de un dígito, que es lo
 * que inundaba los resultados.
 */

/** Confianza de una coincidencia aproximada: 1 = alta, 2 = media, 3 = baja. */
export type BibMatchLevel = 1 | 2 | 3;

/** Como máximo estos dorsales parecidos, por más candidatos que haya. */
export const MAX_SUGGESTED_BIBS = 8;
/** Y como máximo estas fotos entre todos ellos. */
export const MAX_SUGGESTED_PHOTOS = 60;
/** Debajo de este largo, "parecido" no significa nada: 12 se parece a 13, 15, 16… */
export const MIN_BIB_LENGTH_FOR_SUGGESTIONS = 3;

/**
 * Normaliza para comparar: sin espacios ni separadores, en mayúsculas y sin
 * ceros a la izquierda. Así "0042", "42" y "#42 " son el mismo dorsal.
 */
export function normalizeBib(raw: string | null | undefined): string {
  if (!raw) return "";
  const clean = raw.trim().toUpperCase().replace(/[\s.\-_#/]/g, "");
  return clean.replace(/^0+(?=.)/, "");
}

/** ¿Son el mismo dorsal, más allá de cómo esté escrito? */
export function sameBib(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeBib(a);
  return na !== "" && na === normalizeBib(b);
}

// Pares que el OCR confunde de verdad. Clave = los dos caracteres ordenados.
const CONFUSABLE_PAIRS = [
  "08", "06", "09", "0O", "0D", "0Q", "0U",
  "17", "14", "1I", "1L", "1T", "1J",
  "27", "2Z",
  "35", "38", "39",
  "49", "4A",
  "56", "58", "5S",
  "68", "69", "6G",
  "79", "7T",
  "89", "8B",
  "9G", "9Q",
];

const CONFUSABLE = new Set(
  CONFUSABLE_PAIRS.map((p) => [...p].sort().join("")),
);

function isConfusable(a: string, b: string): boolean {
  return CONFUSABLE.has([a, b].sort().join(""));
}

/** Una sola inserción/borrado convierte `short` en `long`. */
function isSingleEdit(short: string, long: string): boolean {
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    j++;
  }
  return true;
}

/**
 * Qué tan parecido es `candidate` a `bib` buscado. Devuelve null si no lo es.
 * Ambos deben venir ya normalizados.
 *
 * - 1 (alta):  un carácter cambiado por otro que el OCR confunde (1042 → 1082)
 * - 2 (media): dos dígitos dados vuelta (1042 → 1024), o un carácter de más o
 *              de menos (1042 → 042, dígito tapado en la foto)
 * - 3 (baja):  un carácter cambiado por cualquier otro (1042 → 1052)
 */
export function bibSimilarity(query: string, candidate: string): BibMatchLevel | null {
  if (!query || !candidate || query === candidate) return null;
  if (query.length < MIN_BIB_LENGTH_FOR_SUGGESTIONS) return null;
  if (Math.abs(query.length - candidate.length) > 1) return null;

  if (query.length === candidate.length) {
    const diffs: number[] = [];
    for (let i = 0; i < query.length; i++) {
      if (query[i] !== candidate[i]) {
        diffs.push(i);
        if (diffs.length > 2) return null;
      }
    }
    if (diffs.length === 1) {
      const i = diffs[0]!;
      return isConfusable(query[i]!, candidate[i]!) ? 1 : 3;
    }
    if (diffs.length === 2) {
      const [i, j] = diffs as [number, number];
      const transposed =
        j === i + 1 && query[i] === candidate[j] && query[j] === candidate[i];
      return transposed ? 2 : null;
    }
    return null;
  }

  const [short, long] =
    query.length < candidate.length ? [query, candidate] : [candidate, query];
  return isSingleEdit(short, long) ? 2 : null;
}

// ── Fotos con varios dorsales ─────────────────────────────────────────────────
//
// `Photo.bibNumber` guarda TODOS los dorsales de la foto separados por coma:
// "1559,1734,6108". Así lo escribe el OCR y así lo edita el admin. En una
// carrera de calle es lo normal —en MARATON COLEGIO DE ABOGADOS el 70 % de las
// fotos tiene más de uno— así que nada puede comparar el valor entero: hay que
// separarlo. Comparar el valor entero dejaba a 867 de 1015 corredores sin
// ninguna foto al buscar su número.

/** Los dorsales de una foto, normalizados y sin repetir, en el orden guardado. */
export function bibsDe(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const vistos = new Set<string>();
  for (const parte of raw.split(/[,;]/)) {
    const n = normalizeBib(parte);
    if (n) vistos.add(n);
  }
  return [...vistos];
}

/** "#1559 · #1734", o "#1559 +2" si se pasa `max` y hay más. */
export function formatearDorsales(raw: string | null | undefined, max = Infinity): string {
  const bibs = bibsDe(raw);
  const visibles = bibs.slice(0, max).map((b) => `#${b}`).join(" · ");
  return bibs.length > max ? `${visibles} +${bibs.length - max}` : visibles;
}

/**
 * Filtro de Prisma para "la foto tiene este dorsal", del lado de la base.
 * Espera el dorsal en su forma canónica (normalizado) y cubre las cuatro
 * posiciones posibles en la lista. Para lo que no necesita la precisión de
 * `bibsDe` —sugerencias, conteos—, sin traer las filas a memoria.
 */
export function filtroDorsal(bib: string) {
  return {
    OR: [
      { bibNumber: bib },
      { bibNumber: { startsWith: `${bib},` } },
      { bibNumber: { endsWith: `,${bib}` } },
      { bibNumber: { contains: `,${bib},` } },
    ],
  };
}

export type CoincidenciasDorsal = {
  /** Valores guardados que contienen el dorsal buscado. */
  exactos: string[];
  /** Dorsales parecidos, ordenados de más a menos probable y ya recortados. */
  parecidos: { bib: string; level: BibMatchLevel; valores: string[] }[];
};

/**
 * Qué valores guardados contienen el dorsal buscado, y qué dorsales se le
 * parecen. Compara dorsal por dorsal, no el valor entero.
 *
 * `valores` son los distintos `bibNumber` de la colección, tal como están.
 */
export function buscarDorsal(buscado: string, valores: string[]): CoincidenciasDorsal {
  const q = normalizeBib(buscado);
  if (!q) return { exactos: [], parecidos: [] };

  const porDorsal = new Map<string, Set<string>>();
  for (const valor of valores) {
    for (const b of bibsDe(valor)) {
      const lista = porDorsal.get(b) ?? new Set<string>();
      lista.add(valor);
      porDorsal.set(b, lista);
    }
  }

  const exactos = [...(porDorsal.get(q) ?? [])];

  const similares: { bib: string; level: BibMatchLevel; valores: string[] }[] = [];
  for (const [b, vs] of porDorsal) {
    if (b === q) continue;
    const level = bibSimilarity(q, b);
    if (level !== null) similares.push({ bib: b, level, valores: [...vs] });
  }

  // Si el dorsal apareció, sólo parecidos de confianza alta o media. Sin
  // coincidencia exacta se abre la mano: es la única pista que queda.
  const maxLevel = exactos.length > 0 ? 2 : 3;
  const parecidos = similares
    .filter((s) => s.level <= maxLevel)
    .sort((a, b) => a.level - b.level || a.bib.localeCompare(b.bib, "es", { numeric: true }))
    .slice(0, MAX_SUGGESTED_BIBS);

  return { exactos, parecidos };
}
