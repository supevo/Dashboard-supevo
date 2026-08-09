/**
 * Regelbasierte Kategorisierung von Bankumsätzen (Fallback ohne KI). Trifft die
 * eindeutigen Fälle über Schlüsselwörter in Empfänger + Verwendungszweck
 * (Löhne, SV/Krankenkassen, Finanzamt, Miete, Bank, typische Anbieter …).
 * Reine Funktion → testbar. Rückgabe: Kategorie-Id + Konfidenz (0..1).
 */

export interface CategorizableTx {
  gegen: string | null;
  zweck: string | null;
  betragCents: number;
}

export interface CategoryGuess {
  kategorieId: string;
  konfidenz: number;
}

interface Rule {
  kategorieId: string;
  keywords: string[];
  /** Nur anwenden, wenn Betrag dieses Vorzeichen hat. */
  sign?: 'in' | 'out';
}

// Reihenfolge = Priorität (erste Regel gewinnt).
const RULES: Rule[] = [
  { kategorieId: 'ust_zahlung', keywords: ['finanzamt', 'finanzkasse', 'umsatzsteuer', 'ust-va', 'ustva'], sign: 'out' },
  { kategorieId: 'est_vorauszahlung', keywords: ['einkommensteuer', 'est-vorauszahlung'], sign: 'out' },
  { kategorieId: 'sozialversicherung', keywords: ['krankenkasse', 'aok', 'barmer', 'techniker krankenkasse', 'tk ', 'dak', 'ikk', 'knappschaft', 'sozialversicherung', 'sozialkasse', 'minijob', 'einzugsstelle'], sign: 'out' },
  { kategorieId: 'lohnsteuer', keywords: ['lohnsteuer'], sign: 'out' },
  { kategorieId: 'loehne_gehaelter', keywords: ['lohn', 'gehalt', 'gehaelter', 'gehälter', 'entgeltabrechnung'], sign: 'out' },
  { kategorieId: 'raumkosten', keywords: ['miete', 'vermietung', 'immobilien', 'nebenkosten', 'hausverwaltung'], sign: 'out' },
  { kategorieId: 'telefon_internet', keywords: ['telekom', 'vodafone', '1&1', '1und1', 'o2', 'telefonica', 'mobilfunk', 'internet', 'dsl'], sign: 'out' },
  { kategorieId: 'versicherungen', keywords: ['versicherung', 'allianz', 'axa', 'huk', 'ergo', 'gothaer', 'signal iduna', 'r+v', 'vhv'], sign: 'out' },
  { kategorieId: 'nebenkosten_geldverkehr', keywords: ['kontoführung', 'kontofuehrung', 'entgelt', 'kontogebühr', 'kontogebuehr', 'bankgebühr', 'bankgebuehr', 'buchungsposten'], sign: 'out' },
  { kategorieId: 'software_lizenzen', keywords: ['google', 'microsoft', 'adobe', 'aws', 'amazon web', 'figma', 'slack', 'notion', 'openai', 'vercel', 'github', 'atlassian', 'apple.com/bill', 'dropbox', 'hetzner', 'ionos', 'strato'], sign: 'out' },
  { kategorieId: 'werbung', keywords: ['facebook', 'meta platforms', 'google ads', 'linkedin', 'werbung', 'ads ', 'tiktok'], sign: 'out' },
  { kategorieId: 'kfz', keywords: ['tankstelle', 'aral', 'shell', 'esso', 'jet', 'total', 'adac', 'kfz', 'werkstatt', 'dekra', 'tüv', 'tuv'], sign: 'out' },
  { kategorieId: 'reisekosten', keywords: ['bahn', 'deutsche bahn', 'db vertrieb', 'lufthansa', 'flug', 'hotel', 'booking.com', 'sixt', 'europcar', 'flixbus'], sign: 'out' },
  { kategorieId: 'bewirtung', keywords: ['restaurant', 'gaststätte', 'gaststaette', 'cafe', 'café', 'bäckerei', 'baeckerei', 'lieferando', 'mcdonald', 'bewirtung'], sign: 'out' },
  { kategorieId: 'fortbildung', keywords: ['seminar', 'schulung', 'fortbildung', 'udemy', 'masterclass', 'coaching', 'kurs'], sign: 'out' },
  { kategorieId: 'rechts_beratung', keywords: ['rechtsanwalt', 'anwalt', 'steuerberater', 'notar', 'kanzlei', 'datev'], sign: 'out' },
  { kategorieId: 'buerobedarf', keywords: ['bürobedarf', 'buerobedarf', 'staples', 'office', 'papier'], sign: 'out' },
  { kategorieId: 'privatentnahme', keywords: ['privat', 'privatentnahme', 'entnahme'] },
];

function haystack(tx: CategorizableTx): string {
  return `${tx.gegen ?? ''} ${tx.zweck ?? ''}`.toLowerCase();
}

/** Guesses a category for one transaction, or null if nothing is confident. */
export function categorizeTransaction(tx: CategorizableTx): CategoryGuess | null {
  const hay = haystack(tx);
  const isIn = tx.betragCents >= 0;

  for (const rule of RULES) {
    if (rule.sign === 'in' && !isIn) continue;
    if (rule.sign === 'out' && isIn) continue;
    if (rule.keywords.some((k) => hay.includes(k))) {
      return { kategorieId: rule.kategorieId, konfidenz: 0.9 };
    }
  }

  // Fallback per direction (low confidence – user should confirm).
  if (isIn) return { kategorieId: 'umsatz_19', konfidenz: 0.4 };
  return { kategorieId: 'sonstige_ausgaben', konfidenz: 0.4 };
}
