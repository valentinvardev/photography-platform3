export type DiscountTier = { minQty: number; priceEach: number };
export type DiscountCode = { code: string; percent: number };

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
