/**
 * Buchhaltung – fester Kontenrahmen (angelehnt an SKR03/EÜR). Keine DB-Tabelle:
 * Kategorien sind im Code definiert, damit Fachlogik (EÜR, USt, Abzugsquoten)
 * und UI denselben Katalog nutzen.
 *
 * art:   einnahme | ausgabe | privat | neutral
 * ust:   Regel-USt-Satz in Prozent (Kleinunternehmer §19 überschreibt → 0)
 * quote: Abzugsquote als Betriebsausgabe (Bewirtung 0.7; Vorsteuer bleibt voll)
 * dauerbeleg: Nachweis ist Vertrag/Abrechnung statt Einzelbeleg → keine Beleglücke
 */

export type KategorieArt = 'einnahme' | 'ausgabe' | 'privat' | 'neutral';

export interface Kategorie {
  id: string;
  label: string;
  art: KategorieArt;
  ust: number;
  /** EÜR-Zeile/Gruppe (grob) für die Aufstellung. */
  euer: string;
  quote?: number;
  dauerbeleg?: boolean;
}

export const KATEGORIEN: Kategorie[] = [
  // --- Einnahmen ---
  { id: 'umsatz_19', label: 'Umsatzerlöse 19 %', art: 'einnahme', ust: 19, euer: 'Betriebseinnahmen' },
  { id: 'umsatz_7', label: 'Umsatzerlöse 7 %', art: 'einnahme', ust: 7, euer: 'Betriebseinnahmen' },
  { id: 'umsatz_eu_0', label: 'Reverse-Charge / EU 0 %', art: 'einnahme', ust: 0, euer: 'Betriebseinnahmen' },
  { id: 'sonstige_ertraege', label: 'Sonstige Erträge', art: 'einnahme', ust: 19, euer: 'Betriebseinnahmen' },

  // --- Ausgaben ---
  { id: 'wareneinkauf', label: 'Wareneinkauf', art: 'ausgabe', ust: 19, euer: 'Wareneinkauf' },
  { id: 'fremdleistungen', label: 'Fremdleistungen', art: 'ausgabe', ust: 19, euer: 'Fremdleistungen' },
  { id: 'software_lizenzen', label: 'Software & Lizenzen', art: 'ausgabe', ust: 19, euer: 'Betriebsausgaben' },
  { id: 'buerobedarf', label: 'Bürobedarf', art: 'ausgabe', ust: 19, euer: 'Betriebsausgaben' },
  { id: 'raumkosten', label: 'Raumkosten / Miete', art: 'ausgabe', ust: 0, euer: 'Raumkosten', dauerbeleg: true },
  { id: 'telefon_internet', label: 'Telefon / Internet', art: 'ausgabe', ust: 19, euer: 'Betriebsausgaben' },
  { id: 'reisekosten', label: 'Reisekosten', art: 'ausgabe', ust: 19, euer: 'Reisekosten' },
  { id: 'bewirtung', label: 'Bewirtung (70 %)', art: 'ausgabe', ust: 19, euer: 'Bewirtung', quote: 0.7 },
  { id: 'kfz', label: 'Kfz-Kosten', art: 'ausgabe', ust: 19, euer: 'Kfz-Kosten' },
  { id: 'werbung', label: 'Werbung', art: 'ausgabe', ust: 19, euer: 'Werbung' },
  { id: 'fortbildung', label: 'Fortbildung', art: 'ausgabe', ust: 19, euer: 'Betriebsausgaben' },
  { id: 'versicherungen', label: 'Versicherungen', art: 'ausgabe', ust: 0, euer: 'Versicherungen', dauerbeleg: true },
  { id: 'gwg', label: 'GWG (bis 800 €)', art: 'ausgabe', ust: 19, euer: 'Abschreibungen/GWG' },
  { id: 'nebenkosten_geldverkehr', label: 'Nebenkosten Geldverkehr', art: 'ausgabe', ust: 0, euer: 'Betriebsausgaben', dauerbeleg: true },
  { id: 'rechts_beratung', label: 'Rechts- / Beratungskosten', art: 'ausgabe', ust: 19, euer: 'Betriebsausgaben' },
  { id: 'sonstige_ausgaben', label: 'Sonstige Ausgaben', art: 'ausgabe', ust: 19, euer: 'Betriebsausgaben' },

  // --- Personalkosten ---
  { id: 'loehne_gehaelter', label: 'Löhne / Gehälter', art: 'ausgabe', ust: 0, euer: 'Personalkosten', dauerbeleg: true },
  { id: 'sozialversicherung', label: 'Sozialversicherung (AG-Anteil)', art: 'ausgabe', ust: 0, euer: 'Personalkosten', dauerbeleg: true },
  { id: 'lohnsteuer', label: 'Lohnsteuer', art: 'ausgabe', ust: 0, euer: 'Personalkosten', dauerbeleg: true },

  // --- Privat / neutral ---
  { id: 'privatentnahme', label: 'Privatentnahme', art: 'privat', ust: 0, euer: '—' },
  { id: 'privateinlage', label: 'Privateinlage', art: 'privat', ust: 0, euer: '—' },
  { id: 'ust_zahlung', label: 'USt-Zahlung Finanzamt', art: 'neutral', ust: 0, euer: '—', dauerbeleg: true },
  { id: 'est_vorauszahlung', label: 'Einkommensteuer-Vorauszahlung (privat)', art: 'privat', ust: 0, euer: '—', dauerbeleg: true },
  { id: 'umbuchung', label: 'Umbuchung', art: 'neutral', ust: 0, euer: '—', dauerbeleg: true },
];

const BY_ID = new Map(KATEGORIEN.map((k) => [k.id, k]));

export function kategorie(id: string | null | undefined): Kategorie | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

export function kategorieLabel(id: string | null | undefined): string {
  return kategorie(id)?.label ?? '—';
}

/** Categories grouped by art, for a grouped <select>. */
export const KATEGORIEN_BY_ART: { art: KategorieArt; label: string; items: Kategorie[] }[] = [
  { art: 'einnahme', label: 'Einnahmen', items: KATEGORIEN.filter((k) => k.art === 'einnahme') },
  { art: 'ausgabe', label: 'Ausgaben', items: KATEGORIEN.filter((k) => k.art === 'ausgabe') },
  { art: 'privat', label: 'Privat', items: KATEGORIEN.filter((k) => k.art === 'privat') },
  { art: 'neutral', label: 'Neutral', items: KATEGORIEN.filter((k) => k.art === 'neutral') },
];
