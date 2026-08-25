import { normalizeBib } from "~/lib/bib";

export type DiscountTier = { minQty: number; priceEach: number };
export type DiscountCode = { code: string; percent: number };

/** Grupo de las fotos que no tienen dorsal detectado. */
export const CLAVE_SIN_DORSAL = "sin-dorsal";

/**
 * Con qué clave se agrupan las fotos de una misma persona.
 *
 * Las que no tienen dorsal caen todas en un mismo grupo: no hay manera de
 * separarlas por persona desde el servidor, y en la práctica llegan por
 * búsqueda de selfie, o sea de alguien que ya se identificó.
 */
export function claveDePersona(bibNumber: string | null | undefined): string {
  const n = normalizeBib(bibNumber);
  return n === "" ? CLAVE_SIN_DORSAL : n;
}

export function agruparPorPersona<T extends { bibNumber: string | null }>(
  fotos: T[],
): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const f of fotos) {
    const clave = claveDePersona(f.bibNumber);
    const lista = grupos.get(clave) ?? [];
    lista.push(f);
    grupos.set(clave, lista);
  }
  return grupos;
}

export type FotoConPrecio = {
  id: string;
  bibNumber: string | null;
  price: number | null;
};

/**
 * Total de una compra, con el descuento por cantidad aplicado POR PERSONA.
 *
 * El tramo se decide con cuántas fotos hay de ESA persona, no con el total del
 * carrito. Antes se miraba el total: comprar tres fotos de un corredor y tres
 * de otro daba el tramo de seis a los dos, y la promoción es "llevá más fotos
 * tuyas", no "juntá fotos de gente distinta para llegar al descuento".
 *
 * `fotosPorPersona` dice cuántas fotos existen de cada persona —no cuántas se
 * compran— porque el tramo siempre se calculó sobre lo encontrado en la
 * búsqueda. Se conserva ese criterio, sólo que ahora por grupo.
 */
export function calcularTotal(
  compradas: FotoConPrecio[],
  fotosPorPersona: Map<string, number>,
  basePrice: number,
  tiers: DiscountTier[],
): number {
  let total = 0;
  for (const [clave, fotos] of agruparPorPersona(compradas)) {
    const cantidad = fotosPorPersona.get(clave) ?? fotos.length;
    const precioUnitario = calcEffectivePricePerPhoto(cantidad, basePrice, tiers);
    for (const f of fotos) {
      // El precio propio de una foto manda sobre cualquier tramo.
      total += f.price !== null && f.price !== basePrice ? f.price : precioUnitario;
    }
  }
  return total;
}

/**
 * El pack es "todas las fotos de tu dorsal", así que llevar los packs de dos
 * personas cuesta dos packs. Antes un solo pack cubría todos los dorsales que
 * hubiera en la selección.
 */
export function calcularPack(packPrice: number, personas: number): number {
  return packPrice * Math.max(1, personas);
}

export function parseTiers(raw: unknown): DiscountTier[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter(
      (t): t is DiscountTier =>
        typeof t === "object" &&
        t !== null &&
        typeof (t as Record<string, unknown>).minQty === "number" &&
        typeof (t as Record<string, unknown>).priceEach === "number",
    )
    .sort((a, b) => a.minQty - b.minQty);
}

export function parseDiscountCodes(raw: unknown): DiscountCode[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter(
    (d): d is DiscountCode =>
      typeof d === "object" &&
      d !== null &&
      typeof (d as Record<string, unknown>).code === "string" &&
      typeof (d as Record<string, unknown>).percent === "number",
  );
}

export function applyDiscountCode(
  amount: number,
  code: string | null | undefined,
  codes: DiscountCode[],
): { amount: number; percent: number | null } {
  if (!code) return { amount, percent: null };
  const match = codes.find((c) => c.code.toLowerCase() === code.toLowerCase());
  if (!match) return { amount, percent: null };
  return { amount: Math.round(amount * (1 - match.percent / 100)), percent: match.percent };
}

/** Returns the effective per-photo price given total photos found in search */
export function calcEffectivePricePerPhoto(
  totalPhotosInSearch: number,
  basePrice: number,
  tiers: DiscountTier[],
): number {
  const sorted = [...tiers].sort((a, b) => b.minQty - a.minQty);
  for (const tier of sorted) {
    if (totalPhotosInSearch >= tier.minQty) return tier.priceEach;
  }
  return basePrice;
}
