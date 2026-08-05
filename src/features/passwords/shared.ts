// Client-safe constants for the password manager.

/** Fixed category set the AI sorts entries into (by title). */
export const PW_CATEGORIES = [
  'Social Media',
  'Website & Hosting',
  'E-Mail',
  'Werbekonten (Ads)',
  'Design & Tools',
  'Zahlung & Banking',
  'Kunden-Zugänge',
  'Sonstiges',
] as const;

export type PwCategory = (typeof PW_CATEGORIES)[number];

export function isPwCategory(v: string): v is PwCategory {
  return (PW_CATEGORIES as readonly string[]).includes(v);
}
