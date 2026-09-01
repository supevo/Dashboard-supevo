/**
 * Feste Gewerk-Kategorien für Kundenanfragen (Leads). Client- und Server-nutzbar
 * (kein 'server-only'). Die KI ordnet jede Anfrage genau einer Kategorie zu.
 */
export type InquiryCategory =
  | 'bad'
  | 'heizung'
  | 'klima'
  | 'waermepumpe'
  | 'solar'
  | 'elektro'
  | 'sonstiges';

export const INQUIRY_CATEGORIES: InquiryCategory[] = [
  'bad',
  'heizung',
  'klima',
  'waermepumpe',
  'solar',
  'elektro',
  'sonstiges',
];

export const CATEGORY_LABEL: Record<InquiryCategory, string> = {
  bad: 'Bad / Sanitär',
  heizung: 'Heizung',
  klima: 'Klima',
  waermepumpe: 'Wärmepumpe',
  solar: 'Solar / PV',
  elektro: 'Elektro',
  sonstiges: 'Sonstiges',
};

/** Badge-Farben (Tailwind), hell/dunkel-tauglich. */
export const CATEGORY_BADGE: Record<InquiryCategory, string> = {
  bad: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  heizung: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  klima: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  waermepumpe: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  solar: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  elektro: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  sonstiges: 'bg-muted text-muted-foreground',
};

/** Normalisiert einen KI-String auf eine gültige Kategorie (Fallback: sonstiges). */
export function normalizeCategory(raw: unknown): InquiryCategory | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  return (INQUIRY_CATEGORIES as string[]).includes(v)
    ? (v as InquiryCategory)
    : 'sonstiges';
}
