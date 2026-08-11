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
