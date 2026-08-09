/**
 * Steuerschätzung (Näherung, kein Steuerberater-Ersatz). Reine Funktionen.
 * Einkommensteuer nach Tarif §32a EStG (Werte 2025), Solidaritätszuschlag mit
 * Milderungszone, Kirchensteuer, Gewerbesteuer (Messbetrag 3,5 % nach Freibetrag
 * × Hebesatz, Anrechnung auf ESt bis 4-fachem Messbetrag, §35 EStG) und
 * Körperschaftsteuer (15 % + 5,5 % Soli). Ohne Sozialversicherung/Freibeträge.
 *
 * Rechnet intern in Euro, gibt Cent zurück.
 */

import type { RechtsformInfo } from '@/features/accounting/constants';

const round = Math.round;

/** Einkommensteuer-Tarif §32a EStG 2025 für einen einzelnen zvE (Euro). */
export function incomeTaxSingle(zvERaw: number): number {
  const zvE = Math.floor(Math.max(0, zvERaw));
  if (zvE <= 12096) return 0;
  if (zvE <= 17443) {
    const y = (zvE - 12096) / 10000;
    return Math.floor((932.3 * y + 1400) * y);
  }
  if (zvE <= 68480) {
    const z = (zvE - 17443) / 10000;
    return Math.floor((176.64 * z + 2397) * z + 1015.13);
  }
  if (zvE <= 277825) return Math.floor(0.42 * zvE - 10911.92);
  return Math.floor(0.45 * zvE - 19246.67);
}

/** Einkommensteuer mit optionalem Ehegatten-Splitting. */
export function incomeTax(zvE: number, splitting: boolean): number {
  if (splitting) return 2 * incomeTaxSingle(zvE / 2);
  return incomeTaxSingle(zvE);
}

/** Solidaritätszuschlag mit Freigrenze + Milderungszone (2025). */
export function soli(est: number, splitting: boolean): number {
  const freigrenze = splitting ? 39900 : 19950;
  if (est <= freigrenze) return 0;
  return Math.min(0.055 * est, 0.119 * (est - freigrenze));
}

export interface GewerbeResult {
  messbetragEuro: number;
  gewerbesteuerEuro: number;
}

/** Gewerbesteuer: Messbetrag 3,5 % nach Freibetrag × Hebesatz. */
export function gewerbesteuer(
  gewinnEuro: number,
  hebesatzPct: number,
  freibetragEligible: boolean,
): GewerbeResult {
  if (gewinnEuro <= 0 || hebesatzPct <= 0) {
    return { messbetragEuro: 0, gewerbesteuerEuro: 0 };
  }
  const ertrag = Math.floor(gewinnEuro / 100) * 100; // auf volle 100 € abrunden
  const freibetrag = freibetragEligible ? 24500 : 0;
  const base = Math.max(0, ertrag - freibetrag);
  const messbetrag = base * 0.035;
  return {
    messbetragEuro: messbetrag,
    gewerbesteuerEuro: messbetrag * (hebesatzPct / 100),
  };
}

export interface TaxEstimateInput {
  gewinnCents: number;
  rechtsform: RechtsformInfo;
  hebesatzPct: number | null;
  splitting: boolean;
  kirchensteuer: boolean;
  weitereEinkuenfteCents: number;
  ustZahllastCents: number;
}

export interface TaxEstimate {
  /** Zeilen für die Aufschlüsselung (Label → Betrag in Cent). */
  lines: { label: string; cents: number }[];
  ertragsteuerCents: number; // ESt/KSt + Soli + KiSt (nach Anrechnung)
  gewerbesteuerCents: number;
  offeneUstCents: number;
  ruecklageCents: number;
}

/** Full estimate; branches on Einkommensteuer vs. Körperschaftsteuer. */
export function estimateTaxes(input: TaxEstimateInput): TaxEstimate {
  const gewinn = input.gewinnCents / 100;
  const weitere = input.weitereEinkuenfteCents / 100;
  const hebesatz = input.hebesatzPct ?? 0;
  const lines: { label: string; cents: number }[] = [];
  const c = (euro: number): number => round(euro * 100);

  const gew = input.rechtsform.gewerbesteuer
    ? gewerbesteuer(gewinn, hebesatz, input.rechtsform.gewerbesteuerFreibetrag)
    : { messbetragEuro: 0, gewerbesteuerEuro: 0 };

  let ertragsteuerEuro = 0;

  if (input.rechtsform.steuerart === 'koerperschaftsteuer') {
    const kst = gewinn > 0 ? 0.15 * gewinn : 0;
    const soliV = 0.055 * kst;
    ertragsteuerEuro = kst + soliV;
    lines.push({ label: 'Körperschaftsteuer (15 %)', cents: c(kst) });
    lines.push({ label: 'Solidaritätszuschlag (5,5 %)', cents: c(soliV) });
  } else {
    const zvE = gewinn + weitere;
    const est = incomeTax(zvE, input.splitting);
    const anrechnung = input.rechtsform.gewerbesteuer
      ? Math.min(4 * gew.messbetragEuro, gew.gewerbesteuerEuro, est)
      : 0;
    const estNach = Math.max(0, est - anrechnung);
    const soliV = soli(estNach, input.splitting);
    const kist = input.kirchensteuer ? 0.09 * estNach : 0;
    ertragsteuerEuro = estNach + soliV + kist;

    lines.push({ label: 'Einkommensteuer (§32a)', cents: c(est) });
    if (anrechnung > 0) {
      lines.push({ label: 'Anrechnung Gewerbesteuer (§35)', cents: -c(anrechnung) });
    }
    lines.push({ label: 'Solidaritätszuschlag', cents: c(soliV) });
    if (input.kirchensteuer) {
      lines.push({ label: 'Kirchensteuer (9 %)', cents: c(kist) });
    }
  }

  if (input.rechtsform.gewerbesteuer) {
    lines.push({
      label: `Gewerbesteuer (Hebesatz ${hebesatz} %)`,
      cents: c(gew.gewerbesteuerEuro),
    });
  }

  const ertragsteuerCents = c(ertragsteuerEuro);
  const gewerbesteuerCents = c(gew.gewerbesteuerEuro);
  const offeneUstCents = Math.max(0, input.ustZahllastCents);

  return {
    lines,
    ertragsteuerCents,
    gewerbesteuerCents,
    offeneUstCents,
    ruecklageCents: ertragsteuerCents + gewerbesteuerCents + offeneUstCents,
  };
}
