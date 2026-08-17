/**
 * Reine Gutschein-Rabatt-Logik (kein server-only) – im Konfigurator und in
 * Tests nutzbar. Werbebudget ist hier bereits ausgenommen (der Aufrufer
 * übergibt nur den Paketpreis).
 */

export type PromoDiscount = {
  id: string;
  discountKind: 'none' | 'fixed' | 'percent';
  /** fixed → Cent, percent → ganze Prozent. */
  discountValue: number;
};

/** True, wenn die Promotion überhaupt einen einlösbaren Wert hat. */
export function hasDiscount(p: PromoDiscount): boolean {
  return (
    (p.discountKind === 'fixed' || p.discountKind === 'percent') &&
    p.discountValue > 0
  );
}

/**
 * Summe der eingelösten Gutschein-Rabatte auf den Paketpreis (Cent), gedeckelt
 * auf den Paketpreis (nie negativ). Prozentrabatte beziehen sich auf den
 * übergebenen Basispreis.
 */
export function promoDiscountCents(
  baseCents: number,
  promos: PromoDiscount[],
  redeemed: ReadonlySet<string> | string[],
): number {
  const set = Array.isArray(redeemed) ? new Set(redeemed) : redeemed;
  const base = Math.max(0, baseCents);
  let discount = 0;
  for (const p of promos) {
    if (!set.has(p.id)) continue;
    if (p.discountKind === 'fixed') {
      discount += Math.max(0, Math.round(p.discountValue));
    } else if (p.discountKind === 'percent') {
      const pct = Math.min(100, Math.max(0, p.discountValue));
      discount += Math.round((base * pct) / 100);
    }
  }
  return Math.min(discount, base);
}
