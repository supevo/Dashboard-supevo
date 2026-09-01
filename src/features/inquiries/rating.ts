/**
 * Manuelle Bewertungs-Kriterien für Kundenanfragen (Leads). Client- und
 * Server-nutzbar (kein 'server-only'). Jedes Kriterium 1–10.
 */
export type RatingKey = 'price_realism' | 'friendliness' | 'wealth';

export const RATING_CRITERIA: { key: RatingKey; label: string; hint: string }[] = [
  {
    key: 'price_realism',
    label: 'Realistische Preisvorstellung',
    hint: 'Passt das Budget/die Erwartung zur Leistung?',
  },
  { key: 'friendliness', label: 'Freundlichkeit', hint: 'Wie angenehm war der Kontakt?' },
  {
    key: 'wealth',
    label: 'Zahlungskraft / Wohlstand',
    hint: 'Wie zahlungskräftig wirkt der Interessent?',
  },
];

export const RATING_KEYS: RatingKey[] = RATING_CRITERIA.map((c) => c.key);

export type InquiryRatings = Partial<Record<RatingKey, number>>;

/** Liest das ratings-JSON robust in ein typisiertes Objekt (Werte auf 1–10). */
export function parseRatings(raw: unknown): InquiryRatings {
  if (!raw || typeof raw !== 'object') return {};
  const out: InquiryRatings = {};
  for (const key of RATING_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n >= 1 && n <= 10) out[key] = Math.round(n);
  }
  return out;
}

/** Durchschnitt der gesetzten Kriterien (1–10, eine Nachkommastelle) oder null. */
export function ratingsAverage(ratings: InquiryRatings): number | null {
  const vals = RATING_KEYS.map((k) => ratings[k]).filter(
    (v): v is number => typeof v === 'number',
  );
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}
