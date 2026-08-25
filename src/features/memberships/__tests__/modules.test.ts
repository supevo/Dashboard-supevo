import { describe, it, expect } from 'vitest';
import {
  moduleMonthlyCents,
  totalMonthlyCents,
  normalizeSelections,
  firstOfNextMonth,
  removedModuleIds,
  moduleLabel,
  groupByCategory,
  rowToModuleDef,
  type ModuleDef,
  type PriceContext,
} from '@/features/memberships/modules';

const ctx: PriceContext = { stage1NetCents: 99000, stage2NetCents: 199000 };

const web: ModuleDef = {
  key: 'web_paket',
  label: 'Web-Paket',
  description: '',
  features: [],
  icon: null,
  category: 'Web',
  categoryPosition: 1,
  position: 2,
  pricing: { kind: 'flat', netCents: 34000 },
  captureBudget: false,
  budgetViaOptions: false,
  keywordCents: 0,
  keywordDefault: 0,
  addonModuleKey: null,
  addonRequired: false,
  delivery: {
    planInclude: false,
    planPhase: null,
    taskMode: 'none',
    taskPerQty: false,
    taskRecurringFreq: null,
    taskStretchWeeks: false,
  },
};
const seo: ModuleDef = {
  key: 'seo',
  label: 'SEO-Beiträge',
  description: '',
  features: [],
  icon: null,
  category: 'SEO',
  categoryPosition: 2,
  position: 4,
  pricing: {
    kind: 'per_unit',
    netCents: 8000,
    unitLabel: 'Beiträge/Monat',
    defaultQty: 4,
    minQty: 0,
    maxQty: 30,
  },
  captureBudget: false,
  budgetViaOptions: false,
  keywordCents: 0,
  keywordDefault: 0,
  addonModuleKey: null,
  addonRequired: false,
  delivery: {
    planInclude: false,
    planPhase: null,
    taskMode: 'none',
    taskPerQty: false,
    taskRecurringFreq: null,
    taskStretchWeeks: false,
  },
};
const stage1: ModuleDef = {
  key: 'supevo_stage1',
  label: 'Stage 1',
  description: '',
  features: [],
  icon: null,
  category: 'supevo',
  categoryPosition: 0,
  position: 0,
  pricing: { kind: 'stage', stage: 1 },
  captureBudget: false,
  budgetViaOptions: false,
  keywordCents: 0,
  keywordDefault: 0,
  addonModuleKey: null,
  addonRequired: false,
  delivery: {
    planInclude: false,
    planPhase: null,
    taskMode: 'none',
    taskPerQty: false,
    taskRecurringFreq: null,
    taskStretchWeeks: false,
  },
};
const ads: ModuleDef = {
  key: 'google_ads',
  label: 'Google Ads',
  description: '',
  features: [],
  icon: null,
  category: 'Ads',
  categoryPosition: 3,
  position: 5,
  pricing: { kind: 'flat', netCents: 24500 },
  captureBudget: true,
  budgetViaOptions: false,
  keywordCents: 0,
  keywordDefault: 0,
  addonModuleKey: null,
  addonRequired: false,
  delivery: {
    planInclude: false,
    planPhase: null,
    taskMode: 'none',
    taskPerQty: false,
    taskRecurringFreq: null,
    taskStretchWeeks: false,
  },
};

describe('moduleMonthlyCents', () => {
  it('Fixpreis', () => {
    expect(moduleMonthlyCents(web, { id: 'web_paket', enabled: true }, ctx)).toBe(34000);
  });
  it('per_unit × Menge', () => {
    expect(moduleMonthlyCents(seo, { id: 'seo', enabled: true, qty: 3 }, ctx)).toBe(24000);
  });
  it('per_unit Default', () => {
    expect(moduleMonthlyCents(seo, { id: 'seo', enabled: true }, ctx)).toBe(32000);
  });
  it('per_unit klemmt an min/max', () => {
    expect(moduleMonthlyCents(seo, { id: 'seo', enabled: true, qty: -5 }, ctx)).toBe(0);
    expect(moduleMonthlyCents(seo, { id: 'seo', enabled: true, qty: 999 }, ctx)).toBe(8000 * 30);
  });
  it('kaputte maxQty=0 klemmt den Preis NICHT auf 0', () => {
    // Reproduziert den Bug: 125 €/Einheit, aber max_qty=0 (aus Fixpreis→
    // Pro-Einheit-Umstellung). Ohne Fix wäre der Preis dauerhaft 0.
    const broken: ModuleDef = {
      ...seo,
      pricing: {
        kind: 'per_unit',
        netCents: 12500,
        unitLabel: 'Landingpages',
        defaultQty: 0,
        minQty: 0,
        maxQty: 0,
      },
    };
    // aktiv ohne explizite Menge → mindestens 1 Einheit
    expect(moduleMonthlyCents(broken, { id: 'seo', enabled: true }, ctx)).toBe(12500);
    // Menge erhöhen wirkt wieder
    expect(moduleMonthlyCents(broken, { id: 'seo', enabled: true, qty: 3 }, ctx)).toBe(37500);
  });
  it('maxQty=1 bei Pro-Einheit kappt den Preis NICHT (frei skalierbar)', () => {
    // Google-Ads-Landingpage-Fall: 125 €/Einheit, max_qty=1. Ein Limit von 1
    // ergibt bei „pro Einheit" keinen Sinn und darf die Menge nicht sperren.
    const lp: ModuleDef = {
      ...seo,
      pricing: {
        kind: 'per_unit',
        netCents: 12500,
        unitLabel: 'Landingpages',
        defaultQty: 1,
        minQty: 1,
        maxQty: 1,
      },
    };
    expect(moduleMonthlyCents(lp, { id: 'seo', enabled: true, qty: 1 }, ctx)).toBe(12500);
    expect(moduleMonthlyCents(lp, { id: 'seo', enabled: true, qty: 3 }, ctx)).toBe(37500);
  });
  it('stage nutzt den Kontextpreis', () => {
    expect(moduleMonthlyCents(stage1, { id: 'supevo_stage1', enabled: true }, ctx)).toBe(99000);
  });
  it('deaktiviert = 0', () => {
    expect(moduleMonthlyCents(web, { id: 'web_paket', enabled: false }, ctx)).toBe(0);
  });
  it('Ads-Budget fließt NICHT ein (nur Pauschale 245 €)', () => {
    expect(
      moduleMonthlyCents({ ...ads }, { id: 'google_ads', enabled: true, budgetCents: 500000 }, ctx),
    ).toBe(24500);
  });

  it('Keyword-Skalierung: Pauschale + Keywords × Preis', () => {
    const adsKw: ModuleDef = { ...ads, keywordCents: 1500, keywordDefault: 10 };
    // 245 € + 10 Keywords × 15 € = 245 + 150 = 395 €
    expect(moduleMonthlyCents(adsKw, { id: 'google_ads', enabled: true }, ctx)).toBe(24500 + 15000);
    // eigene Keyword-Zahl
    expect(
      moduleMonthlyCents(adsKw, { id: 'google_ads', enabled: true, keywords: 20 }, ctx),
    ).toBe(24500 + 30000);
  });

  it('Add-on ist ein eigenes Modul – zählt über sein eigenes enabled, nicht hier', () => {
    const adsWithAddon: ModuleDef = {
      ...ads,
      addonModuleKey: 'google_business',
      addonRequired: true,
    };
    // Der Ads-Preis selbst ändert sich durch die Add-on-Referenz nicht.
    expect(moduleMonthlyCents(adsWithAddon, { id: 'google_ads', enabled: true }, ctx)).toBe(24500);
    // Der Add-on-Preis kommt über das referenzierte Modul selbst.
    const gb: ModuleDef = { ...web, key: 'google_business', pricing: { kind: 'flat', netCents: 9900 } };
    expect(
      totalMonthlyCents(
        [adsWithAddon, gb],
        [
          { id: 'google_ads', enabled: true },
          { id: 'google_business', enabled: true },
        ],
        ctx,
      ),
    ).toBe(24500 + 9900);
  });
});

describe('totalMonthlyCents', () => {
  it('summiert aktive Module über den Katalog', () => {
    const total = totalMonthlyCents(
      [web, seo, ads],
      [
        { id: 'web_paket', enabled: true },
        { id: 'seo', enabled: true, qty: 2 },
        { id: 'google_ads', enabled: false },
      ],
      ctx,
    );
    expect(total).toBe(34000 + 16000);
  });
  it('ignoriert unbekannte ids', () => {
    expect(totalMonthlyCents([web], [{ id: 'gibtsnicht', enabled: true }], ctx)).toBe(0);
  });
});

describe('removedModuleIds', () => {
  it('erkennt abgewählte Module', () => {
    expect(
      removedModuleIds(
        [{ id: 'web_paket', enabled: true }, { id: 'seo', enabled: true }],
        [{ id: 'web_paket', enabled: true }, { id: 'seo', enabled: false }],
      ),
    ).toEqual(['seo']);
  });
  it('kein Fehlalarm', () => {
    const same = [{ id: 'web_paket', enabled: true }];
    expect(removedModuleIds(same, same)).toEqual([]);
  });
});

describe('moduleLabel', () => {
  it('Label aus Katalog', () => {
    expect(moduleLabel([web, seo], 'seo')).toBe('SEO-Beiträge');
  });
  it('Fallback auf id', () => {
    expect(moduleLabel([web], 'xyz')).toBe('xyz');
  });
});

describe('groupByCategory', () => {
  it('gruppiert und sortiert nach categoryPosition', () => {
    const groups = groupByCategory([ads, web, stage1, seo]);
    expect(groups.map((g) => g.category)).toEqual(['supevo', 'Web', 'SEO', 'Ads']);
  });
});

describe('rowToModuleDef', () => {
  it('mappt eine DB-Zeile auf einen per_unit-Def', () => {
    const def = rowToModuleDef({
      key: 'seo',
      label: 'SEO',
      description: null,
      category_name: 'SEO',
      category_position: 2,
      pricing_kind: 'per_unit',
      net_cents: 8000,
      unit_label: 'Beiträge/Monat',
      default_qty: 4,
      min_qty: 0,
      max_qty: 30,
      stage: null,
      capture_budget: false,
      position: 4,
    });
    expect(def.pricing).toEqual({
      kind: 'per_unit',
      netCents: 8000,
      unitLabel: 'Beiträge/Monat',
      defaultQty: 4,
      minQty: 0,
      maxQty: 30,
    });
    expect(def.category).toBe('SEO');
  });
});

describe('normalizeSelections', () => {
  it('filtert Duplikate, behält Menge', () => {
    const out = normalizeSelections([
      { id: 'web_paket', enabled: true },
      { id: 'web_paket', enabled: true },
      { id: 'seo', enabled: true, qty: 5 },
    ]);
    expect(out.map((s) => s.id)).toEqual(['web_paket', 'seo']);
    expect(out[1]!.qty).toBe(5);
  });
  it('nicht-Array → leer', () => {
    expect(normalizeSelections(null)).toEqual([]);
  });
});

describe('firstOfNextMonth', () => {
  it('mitten im Jahr', () => {
    expect(firstOfNextMonth(new Date('2026-03-15'))).toBe('2026-04-01');
  });
  it('Jahreswechsel', () => {
    expect(firstOfNextMonth(new Date('2026-12-20'))).toBe('2027-01-01');
  });
});
