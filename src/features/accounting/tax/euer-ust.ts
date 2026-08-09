/**
 * EÜR (§4 Abs. 3 EStG, Zufluss-/Abfluss) und Umsatzsteuer-Voranmeldung aus den
 * kategorisierten Bankumsätzen (Ist-Besteuerung → Bankbewegungen sind die
 * Grundlage). Reine, testbare Funktionen. Alle Beträge in Cent.
 *
 * Netto = Bruttobetrag / (1 + USt/100). Bewirtung nur zu 70 % als Betriebs-
 * ausgabe (Vorsteuer aber voll). Privatanteil kürzt anteilig. Privatentnahmen/
 * Einlagen, Umbuchungen und Steuerzahlungen bleiben außen vor.
 */

import { kategorie, type Kategorie } from '@/features/accounting/categories';

export interface EuerTx {
  betragCents: number; // > 0 Eingang, < 0 Ausgang (brutto)
  kategorieId: string | null;
  privatanteil: number; // 0..100
}

export interface EuerLine {
  kategorieId: string;
  label: string;
  euer: string;
  nettoCents: number;
}

export interface EuerResult {
  einnahmenNettoCents: number;
  ausgabenNettoCents: number;
  gewinnCents: number;
  einnahmen: EuerLine[];
  ausgaben: EuerLine[];
  /** Umsätze ohne Kategorie – Hinweis für den Nutzer. */
  unkategorisiert: number;
}

export interface UstResult {
  kleinunternehmer: boolean;
  umsatz19NettoCents: number;
  ust19Cents: number;
  umsatz7NettoCents: number;
  ust7Cents: number;
  vorsteuerCents: number;
  zahllastCents: number;
}

function nettoFromBrutto(bruttoCents: number, ustPct: number): number {
  if (ustPct <= 0) return bruttoCents;
  return Math.round(bruttoCents / (1 + ustPct / 100));
}

/** Business share after the private portion (0..1). */
function businessFactor(privatanteil: number): number {
  const p = Math.min(100, Math.max(0, privatanteil || 0));
  return 1 - p / 100;
}

/** EÜR: net business income minus deductible net expenses. */
export function computeEuer(txs: EuerTx[]): EuerResult {
  const einnahmenByKat = new Map<string, number>();
  const ausgabenByKat = new Map<string, number>();
  let unkategorisiert = 0;

  for (const tx of txs) {
    const kat = kategorie(tx.kategorieId);
    if (!kat) {
      unkategorisiert += 1;
      continue;
    }
    if (kat.art === 'privat' || kat.art === 'neutral') continue;

    const brutto = Math.abs(tx.betragCents);
    const netto = nettoFromBrutto(brutto, kat.ust);
    const factor = businessFactor(tx.privatanteil);

    if (kat.art === 'einnahme') {
      const val = Math.round(netto * factor);
      einnahmenByKat.set(kat.id, (einnahmenByKat.get(kat.id) ?? 0) + val);
    } else if (kat.art === 'ausgabe') {
      const quote = kat.quote ?? 1;
      const val = Math.round(netto * factor * quote);
      ausgabenByKat.set(kat.id, (ausgabenByKat.get(kat.id) ?? 0) + val);
    }
  }

  const toLines = (m: Map<string, number>): EuerLine[] =>
    [...m.entries()]
      .map(([id, nettoCents]) => {
        const k = kategorie(id) as Kategorie;
        return { kategorieId: id, label: k.label, euer: k.euer, nettoCents };
      })
      .sort((a, b) => b.nettoCents - a.nettoCents);

  const einnahmen = toLines(einnahmenByKat);
  const ausgaben = toLines(ausgabenByKat);
  const einnahmenNettoCents = einnahmen.reduce((s, l) => s + l.nettoCents, 0);
  const ausgabenNettoCents = ausgaben.reduce((s, l) => s + l.nettoCents, 0);

  return {
    einnahmenNettoCents,
    ausgabenNettoCents,
    gewinnCents: einnahmenNettoCents - ausgabenNettoCents,
    einnahmen,
    ausgaben,
    unkategorisiert,
  };
}

/** USt-Voranmeldung: Umsatzsteuer minus Vorsteuer = Zahllast. */
export function computeUst(
  txs: EuerTx[],
  kleinunternehmer: boolean,
): UstResult {
  if (kleinunternehmer) {
    return {
      kleinunternehmer: true,
      umsatz19NettoCents: 0,
      ust19Cents: 0,
      umsatz7NettoCents: 0,
      ust7Cents: 0,
      vorsteuerCents: 0,
      zahllastCents: 0,
    };
  }

  let umsatz19 = 0;
  let umsatz7 = 0;
  let vorsteuer = 0;

  for (const tx of txs) {
    const kat = kategorie(tx.kategorieId);
    if (!kat || kat.art === 'privat' || kat.art === 'neutral') continue;
    if (kat.ust <= 0) continue;

    const brutto = Math.abs(tx.betragCents);
    const netto = nettoFromBrutto(brutto, kat.ust);
    const factor = businessFactor(tx.privatanteil);

    if (kat.art === 'einnahme') {
      const net = Math.round(netto * factor);
      if (kat.ust === 19) umsatz19 += net;
      else if (kat.ust === 7) umsatz7 += net;
    } else if (kat.art === 'ausgabe') {
      // Vorsteuer voll (auch bei Bewirtung – Quote gilt nur für die EÜR),
      // aber um den Privatanteil gekürzt.
      const vst = Math.round((brutto - netto) * factor);
      vorsteuer += vst;
    }
  }

  const ust19 = Math.round(umsatz19 * 0.19);
  const ust7 = Math.round(umsatz7 * 0.07);
  return {
    kleinunternehmer: false,
    umsatz19NettoCents: umsatz19,
    ust19Cents: ust19,
    umsatz7NettoCents: umsatz7,
    ust7Cents: ust7,
    vorsteuerCents: vorsteuer,
    zahllastCents: ust19 + ust7 - vorsteuer,
  };
}
