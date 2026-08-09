import { describe, it, expect } from 'vitest';
import { computeEuer, computeUst, type EuerTx } from '../euer-ust';
import {
  incomeTaxSingle,
  incomeTax,
  soli,
  gewerbesteuer,
  estimateTaxes,
} from '../estimate';
import { rechtsformInfo } from '../../constants';

describe('computeEuer', () => {
  const txs: EuerTx[] = [
    { betragCents: 119000, kategorieId: 'umsatz_19', privatanteil: 0 }, // netto 100000
    { betragCents: -119000, kategorieId: 'software_lizenzen', privatanteil: 0 }, // netto -100000
    { betragCents: -11900, kategorieId: 'bewirtung', privatanteil: 0 }, // netto 10000, 70% => 7000
    { betragCents: -50000, kategorieId: 'privatentnahme', privatanteil: 0 }, // excluded
    { betragCents: 5000, kategorieId: null, privatanteil: 0 }, // uncategorized
  ];

  it('nets amounts, applies Bewirtung 70%, excludes private/uncategorized', () => {
    const r = computeEuer(txs);
    expect(r.einnahmenNettoCents).toBe(100000);
    expect(r.ausgabenNettoCents).toBe(107000); // 100000 + 7000
    expect(r.gewinnCents).toBe(-7000);
    expect(r.unkategorisiert).toBe(1);
  });

  it('applies private share to expenses', () => {
    const r = computeEuer([
      { betragCents: -11900, kategorieId: 'telefon_internet', privatanteil: 50 },
    ]);
    // netto 10000 * 0.5 = 5000
    expect(r.ausgabenNettoCents).toBe(5000);
  });
});

describe('computeUst', () => {
  it('computes Zahllast = USt - Vorsteuer', () => {
    const r = computeUst(
      [
        { betragCents: 119000, kategorieId: 'umsatz_19', privatanteil: 0 }, // USt 19000
        { betragCents: -59500, kategorieId: 'buerobedarf', privatanteil: 0 }, // Vorsteuer 9500
      ],
      false,
    );
    expect(r.ust19Cents).toBe(19000);
    expect(r.vorsteuerCents).toBe(9500);
    expect(r.zahllastCents).toBe(9500);
  });

  it('returns zero for Kleinunternehmer', () => {
    const r = computeUst(
      [{ betragCents: 119000, kategorieId: 'umsatz_19', privatanteil: 0 }],
      true,
    );
    expect(r.kleinunternehmer).toBe(true);
    expect(r.zahllastCents).toBe(0);
  });
});

describe('income tax §32a 2025', () => {
  it('is zero up to the Grundfreibetrag', () => {
    expect(incomeTaxSingle(12096)).toBe(0);
    expect(incomeTaxSingle(12000)).toBe(0);
  });
  it('is monotonic and hits the top zones', () => {
    expect(incomeTaxSingle(30000)).toBeGreaterThan(incomeTaxSingle(20000));
    // 42% zone: 0.42*100000 - 10911.92 = 31088.08 -> 31088
    expect(incomeTaxSingle(100000)).toBe(31088);
    // 45% zone
    expect(incomeTaxSingle(300000)).toBe(Math.floor(0.45 * 300000 - 19246.67));
  });
  it('splitting halves, taxes, doubles', () => {
    expect(incomeTax(100000, true)).toBe(2 * incomeTaxSingle(50000));
  });
});

describe('soli', () => {
  it('is zero below the Freigrenze', () => {
    expect(soli(19950, false)).toBe(0);
  });
  it('applies the Milderungszone above it', () => {
    const s = soli(21000, false);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(0.055 * 21000);
  });
});

describe('gewerbesteuer', () => {
  it('applies the 24.500 Freibetrag for eligible legal forms', () => {
    const g = gewerbesteuer(50000, 400, true);
    // (50000 - 24500) * 3.5% = 892.5 Messbetrag; * 4.0 Hebesatz = 3570
    expect(Math.round(g.messbetragEuro)).toBe(893);
    expect(Math.round(g.gewerbesteuerEuro)).toBe(3570);
  });
  it('is zero for a loss', () => {
    expect(gewerbesteuer(-1000, 400, true).gewerbesteuerEuro).toBe(0);
  });
});

describe('estimateTaxes', () => {
  it('sums Rücklage = Ertragsteuer + GewSt + offene USt (Einzelunternehmen)', () => {
    const est = estimateTaxes({
      gewinnCents: 6000000, // 60.000 €
      rechtsform: rechtsformInfo('einzelunternehmen'),
      hebesatzPct: 400,
      splitting: false,
      kirchensteuer: false,
      weitereEinkuenfteCents: 0,
      ustZahllastCents: 100000, // 1.000 €
    });
    expect(est.ruecklageCents).toBe(
      est.ertragsteuerCents + est.gewerbesteuerCents + est.offeneUstCents,
    );
    expect(est.offeneUstCents).toBe(100000);
    expect(est.ertragsteuerCents).toBeGreaterThan(0);
  });

  it('uses Körperschaftsteuer for a GmbH', () => {
    const est = estimateTaxes({
      gewinnCents: 10000000, // 100.000 €
      rechtsform: rechtsformInfo('gmbh'),
      hebesatzPct: 400,
      splitting: false,
      kirchensteuer: false,
      weitereEinkuenfteCents: 0,
      ustZahllastCents: 0,
    });
    // KSt 15% of 100k = 15000, Soli 5.5% = 825 -> 15825
    expect(est.ertragsteuerCents).toBe(1582500);
  });
});
