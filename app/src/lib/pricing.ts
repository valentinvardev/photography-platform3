// Relativo y no "~/lib/bib": así el módulo se puede testear compilado suelto
// (scripts/test-dorsales-multiples.mjs) sin resolver el alias.
import { bibsDe } from "./bib";

export type DiscountTier = { minQty: number; priceEach: number };
export type DiscountCode = { code: string; percent: number };

/** Grupo de las fotos que no tienen dorsal detectado. */
export const CLAVE_SIN_DORSAL = "sin-dorsal";

export type FotoDorsal = { id: string; bibNumber: string | null };

/**
 * De quién es cada foto de una compra.
 *
 * Una foto puede tener varios dorsales ("1559,1734"): el corredor que la compra
 * y los que pasaban al lado. Para esta compra la foto es de UNA persona, y hay
 * que decidir cuál, porque de eso salen el tramo de descuento y cuántos packs
 * se cobran. Antes el valor entero era la persona: "1559" y "1559,1734" eran
 * dos personas distintas y el mismo corredor pagaba dos packs.
 *
 * Criterio, en orden:
 * 1. Un dorsal de `preferidos` —el que la persona buscó—, si la foto lo tiene.
 * 2. El dorsal que más se repite entre las fotos elegidas: quien compra cinco
 *    fotos en las que aparece el 1559 es el 1559, aunque en una esté el 1734.
 * 3. A igualdad, el que aparece antes en `preferidos`, y si no, el menor.
 *
 * El desempate es el MISMO para todas las fotos de la compra, a propósito. Si
 * dependiera de cada foto —por ejemplo, "el primero guardado"—, dos amigos que
 * salen juntos en todas las fotos, a veces guardados "1559,1734" y a veces
 * "1734,1559", terminarían repartidos en dos personas: el checkout mostraría
 * un pack y el servidor cobraría dos.
 *
 * `preferidos` sólo elige entre los dorsales que la foto ya tiene, así que
 * mandarlo desde el cliente no permite asignar una foto a otra persona.
 */
export function asignarPersonas(
  elegidas: FotoDorsal[],
  preferidos: string[] = [],
): Map<string, string> {
  const ordenPreferido = new Map<string, number>();
  for (const b of preferidos.flatMap((p) => bibsDe(p))) {
    if (!ordenPreferido.has(b)) ordenPreferido.set(b, ordenPreferido.size);
  }
  const dorsalesDe = new Map<string, string[]>();
  const frecuencia = new Map<string, number>();
  for (const f of elegidas) {
    const bibs = bibsDe(f.bibNumber);
    dorsalesDe.set(f.id, bibs);
    for (const b of bibs) frecuencia.set(b, (frecuencia.get(b) ?? 0) + 1);
  }

  /** Orden total entre dorsales, igual para toda la compra. */
  const antes = (a: string, b: string): number =>
    (frecuencia.get(b) ?? 0) - (frecuencia.get(a) ?? 0) ||
    (ordenPreferido.get(a) ?? Infinity) - (ordenPreferido.get(b) ?? Infinity) ||
    a.localeCompare(b, "es", { numeric: true });

  const clavePorFoto = new Map<string, string>();
  for (const f of elegidas) {
    const bibs = dorsalesDe.get(f.id) ?? [];
    if (bibs.length === 0) {
      clavePorFoto.set(f.id, CLAVE_SIN_DORSAL);
      continue;
    }
    const preferidas = bibs.filter((b) => ordenPreferido.has(b));
    const candidatas = preferidas.length > 0 ? preferidas : bibs;
    clavePorFoto.set(f.id, [...candidatas].sort(antes)[0]!);
  }
  return clavePorFoto;
}

export type Compra<T extends FotoDorsal> = {
  /** La persona de cada foto elegida. */
  clavePorFoto: Map<string, string>;
  /** Las personas distintas entre las elegidas: cuántos packs son. */
  claves: Set<string>;
  /** Los dorsales de esas personas (sin el grupo "sin dorsal"). */
  dorsales: string[];
  /** Las elegidas más todas las que tienen alguno de esos dorsales. */
  alcance: T[];
  /** Cuántas fotos hay de cada persona. Decide el tramo de descuento. */
  fotosPorPersona: Map<string, number>;
};

/**
 * Arma una compra: de quién es cada foto, qué incluye el pack y cuántas fotos
 * cuentan para el descuento. La usan igual el checkout del cliente (para
 * mostrar el precio) y el servidor (para cobrarlo), así nunca difieren.
 *
 * `todas` son las fotos de la colección que tienen dorsal. Una foto entra al
 * alcance si tiene el dorsal de alguna de las personas, aunque tenga otros:
 * es una foto donde esa persona aparece.
 */
export function armarCompra<T extends FotoDorsal>(
  elegidas: T[],
  todas: T[],
  preferidos: string[] = [],
): Compra<T> {
  const clavePorFoto = asignarPersonas(elegidas, preferidos);
  const claves = new Set(clavePorFoto.values());
  const dorsales = [...claves].filter((c) => c !== CLAVE_SIN_DORSAL);
  const esPersona = new Set(dorsales);

  const alcance = new Map<string, T>();
  for (const f of elegidas) alcance.set(f.id, f);
  for (const f of todas) {
    if (alcance.has(f.id)) continue;
    if (bibsDe(f.bibNumber).some((b) => esPersona.has(b))) alcance.set(f.id, f);
  }

  const fotosPorPersona = new Map<string, number>();
  for (const f of alcance.values()) {
    for (const b of bibsDe(f.bibNumber)) {
      if (esPersona.has(b)) fotosPorPersona.set(b, (fotosPorPersona.get(b) ?? 0) + 1);
    }
  }
  const sinDorsal = elegidas.filter((f) => clavePorFoto.get(f.id) === CLAVE_SIN_DORSAL).length;
  if (sinDorsal > 0) fotosPorPersona.set(CLAVE_SIN_DORSAL, sinDorsal);

  return { clavePorFoto, claves, dorsales, alcance: [...alcance.values()], fotosPorPersona };
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
 * carrito: la promoción es "llevá más fotos tuyas", no "juntá fotos de gente
 * distinta para llegar al descuento". Las cantidades vienen de `armarCompra`.
 */
export function calcularTotal(
  compradas: FotoConPrecio[],
  compra: Pick<Compra<FotoDorsal>, "clavePorFoto" | "fotosPorPersona">,
  basePrice: number,
  tiers: DiscountTier[],
): number {
  const grupos = new Map<string, FotoConPrecio[]>();
  for (const f of compradas) {
    const clave =
      compra.clavePorFoto.get(f.id) ?? bibsDe(f.bibNumber)[0] ?? CLAVE_SIN_DORSAL;
    const lista = grupos.get(clave) ?? [];
    lista.push(f);
    grupos.set(clave, lista);
  }

  let total = 0;
  for (const [clave, fotos] of grupos) {
    const cantidad = compra.fotosPorPersona.get(clave) ?? fotos.length;
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
