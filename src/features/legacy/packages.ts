/**
 * Legacy-Kunden-Pakete (Bestandskunden). Preise sind Netto-Monatspreise in Cent.
 *
 * Werbebudget (Google Ads / Meta) ist beim Performance-Paket NICHT im Preis
 * enthalten – es wird separat vom Kunden getragen und nur bei Bedarf am Kunden
 * eingestellt.
 */

export type LegacyPackage = 'care' | 'website' | 'growth' | 'performance';

export const LEGACY_PACKAGES: readonly LegacyPackage[] = [
  'care',
  'website',
  'growth',
  'performance',
] as const;

export function isLegacyPackage(v: unknown): v is LegacyPackage {
  return (
    v === 'care' || v === 'website' || v === 'growth' || v === 'performance'
  );
}

export interface LegacyPackageInfo {
  key: LegacyPackage;
  label: string;
  /** Netto-Monatspreis in Cent. */
  priceCents: number;
  tagline: string;
  features: string[];
  /** Performance trägt ein separates, kundenseitiges Werbebudget. */
  hasAdBudget: boolean;
}

export const LEGACY_PACKAGE_INFO: Record<LegacyPackage, LegacyPackageInfo> = {
  care: {
    key: 'care',
    label: 'supevo Care',
    priceCents: 18000,
    tagline: 'Für Kunden mit bestehender Website – keine Neuerstellung.',
    features: [
      'Hosting, Domain & E-Mail',
      'Technische Wartung, Backups & Sicherheitsupdates',
      'E-Mail- und WhatsApp-Support',
      'Eine Änderungseinheit pro Monat',
      'Technische Funktionskontrolle',
      'Basisstatistik',
    ],
    hasAdBudget: false,
  },
  website: {
    key: 'website',
    label: 'supevo Website',
    priceCents: 46000,
    tagline: 'Standardpaket – Website mit bis zu 3 Hauptseiten.',
    features: [
      'Website mit bis zu 3 Hauptseiten',
      'Impressum & Datenschutz',
      'Domain, Hosting & E-Mail',
      'Mobile Optimierung',
      'Texte & Stockfotos',
      '3 Änderungseinheiten pro Monat',
      'Grundlegende SEO',
      'E-Mail- und WhatsApp-Support',
    ],
    hasAdBudget: false,
  },
  growth: {
    key: 'growth',
    label: 'supevo Growth',
    priceCents: 58000,
    tagline: 'Alle Website-Leistungen plus Wachstum & erweiterte SEO.',
    features: [
      'Alle Leistungen aus supevo Website',
      'Bis zu 5 Hauptseiten',
      '6 Änderungseinheiten pro Monat',
      'Erweiterte SEO',
      'Google Unternehmensprofil',
      'Monatliche Statistik',
      'Conversion-Optimierung wichtiger Seiten',
      'Quartalsweise strategische Überprüfung',
    ],
    hasAdBudget: false,
  },
  performance: {
    key: 'performance',
    label: 'supevo Performance',
    priceCents: 88000,
    tagline: 'Alle Growth-Leistungen plus laufende Kampagnen & Ads.',
    features: [
      'Alle Leistungen aus supevo Growth',
      'Monatliche Landingpage- & Kampagnenoptimierung',
      'Fortlaufende Conversion-Optimierung',
      'Monatliches Marketingreporting',
      'Strategiegespräch',
      'Verwaltung eines Marketingkanals (z. B. Google Ads)',
      'Priorisierte Bearbeitung',
    ],
    hasAdBudget: true,
  },
};

/** Formats a cent amount as a German net monthly price, e.g. „180,00 € netto“. */
export function formatEuroCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}
