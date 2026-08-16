import { describe, it, expect } from 'vitest';
import {
  moduleMonthlyCents,
  totalMonthlyCents,
  normalizeSelections,
  firstOfNextMonth,
  MEMBERSHIP_PRESETS,
  type PriceContext,
} from '@/features/memberships/modules';

const ctx: PriceContext = { stage1NetCents: 99000, stage2NetCents: 199000 };

describe('moduleMonthlyCents', () => {
  it('Fixpreis-Modul (Web-Paket = 340 €)', () => {
    expect(moduleMonthlyCents({ id: 'web_paket', enabled: true }, ctx)).toBe(34000);
  });

  it('per_unit skaliert mit Menge (SEO-Beiträge)', () => {
    expect(
      moduleMonthlyCents({ id: 'seo_beitraege', enabled: true, qty: 3 }, ctx),
    ).toBe(24000);
  });

  it('per_unit ohne Menge nutzt Default (4 Beiträge)', () => {
    expect(
      moduleMonthlyCents({ id: 'seo_beitraege', enabled: true }, ctx),
    ).toBe(32000);
  });

  it('per_unit klemmt an min/max', () => {
    expect(
      moduleMonthlyCents({ id: 'seo_beitraege', enabled: true, qty: -5 }, ctx),
    ).toBe(0); // min 0
    expect(
      moduleMonthlyCents({ id: 'seo_beitraege', enabled: true, qty: 999 }, ctx),
    ).toBe(8000 * 30); // max 30
  });

  it('stage-Modul nimmt den Preis aus dem Kontext', () => {
    expect(moduleMonthlyCents({ id: 'supevo_stage1', enabled: true }, ctx)).toBe(99000);
    expect(moduleMonthlyCents({ id: 'supevo_stage2', enabled: true }, ctx)).toBe(199000);
  });

  it('deaktiviertes Modul kostet 0', () => {
    expect(moduleMonthlyCents({ id: 'web_paket', enabled: false }, ctx)).toBe(0);
  });

  it('unbekanntes Modul kostet 0', () => {
    expect(moduleMonthlyCents({ id: 'gibtsnicht', enabled: true }, ctx)).toBe(0);
  });

  it('Ads-Budget fließt NICHT in den Preis (nur Betreuungspauschale)', () => {
    expect(
      moduleMonthlyCents(
        { id: 'google_ads', enabled: true, budgetCents: 500000 },
        ctx,
      ),
    ).toBe(14900);
  });
});

describe('totalMonthlyCents', () => {
  it('summiert aktive Module', () => {
    const total = totalMonthlyCents(
      [
        { id: 'web_paket', enabled: true }, // 340
        { id: 'wartung', enabled: true }, // 49
        { id: 'seo_beitraege', enabled: true, qty: 2 }, // 160
        { id: 'google_ads', enabled: false }, // 0
      ],
      ctx,
    );
    expect(total).toBe(34000 + 4900 + 16000);
  });
});

describe('Presets', () => {
  it('Web-Preset ergibt 389 € (340 + 49)', () => {
    const web = MEMBERSHIP_PRESETS.find((p) => p.id === 'web')!;
    expect(totalMonthlyCents(web.selections, ctx)).toBe(38900);
  });
  it('supevo-Stage-1-Preset nutzt den Stage-1-Preis', () => {
    const s1 = MEMBERSHIP_PRESETS.find((p) => p.id === 'supevo_stage1')!;
    expect(totalMonthlyCents(s1.selections, ctx)).toBe(99000);
  });
});

describe('normalizeSelections', () => {
  it('filtert unbekannte Module und Duplikate', () => {
    const out = normalizeSelections([
      { id: 'web_paket', enabled: true },
      { id: 'web_paket', enabled: true }, // Duplikat
      { id: 'boom', enabled: true }, // unbekannt
      'quatsch',
      { id: 'seo_beitraege', enabled: true, qty: 5 },
    ]);
    expect(out.map((s) => s.id)).toEqual(['web_paket', 'seo_beitraege']);
    expect(out[1]!.qty).toBe(5);
  });
  it('nicht-Array → leer', () => {
    expect(normalizeSelections(null)).toEqual([]);
    expect(normalizeSelections({})).toEqual([]);
  });
});

describe('firstOfNextMonth', () => {
  it('mitten im Jahr', () => {
    expect(firstOfNextMonth(new Date('2026-03-15'))).toBe('2026-04-01');
  });
  it('Jahreswechsel (Dezember → Januar)', () => {
    expect(firstOfNextMonth(new Date('2026-12-20'))).toBe('2027-01-01');
  });
});
