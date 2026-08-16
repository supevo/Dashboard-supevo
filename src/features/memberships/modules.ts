/**
 * Mitgliedschafts-Baukasten (rein, testbar – kein server-only, damit der
 * Konfigurator den Preis live im Client rechnen kann).
 *
 * Der Kunde/das Onboarding wählt Module an/aus (+ Menge). Die Summe der aktiven
 * Module ergibt den Netto-Monatspreis, der als custom_net_cents gespeichert wird
 * – so bleibt die bestehende Abrechnung unverändert.
 *
 * PREISE SIND PLATZHALTER (außer Web-Paket 340 €). Bitte an eure echten Preise
 * anpassen – alles hier im Code, ein Deploy genügt.
 */

export type ModulePricing =
  | { kind: 'flat'; netCents: number }
  | {
      kind: 'per_unit';
      netCents: number;
      unitLabel: string; // z. B. "Beitrag/Monat"
      defaultQty: number;
      minQty: number;
      maxQty: number;
    }
  // Preis kommt aus den Billing-Settings (Stage 1/2), nicht aus dem Code.
  | { kind: 'stage'; stage: 1 | 2 };

export interface ModuleDef {
  id: string;
  label: string;
  description: string;
  pricing: ModulePricing;
  /** Optionales Zusatzfeld (z. B. Ads-Budget), das NICHT in den Netto-Preis
   *  einfließt (Budget zahlt der Kunde an Google), aber festgehalten wird. */
  captureBudget?: boolean;
}

/**
 * Katalog der verfügbaren Bausteine. Reihenfolge = Anzeigereihenfolge.
 * Preise in Cent (netto).
 */
export const MEMBERSHIP_MODULES: ModuleDef[] = [
  {
    id: 'supevo_stage1',
    label: 'supevo Mitgliedschaft – Stage 1',
    description: 'Große supevo-Mitgliedschaft, Stufe 1 (Preis aus Billing-Einstellungen).',
    pricing: { kind: 'stage', stage: 1 },
  },
  {
    id: 'supevo_stage2',
    label: 'supevo Mitgliedschaft – Stage 2',
    description: 'Große supevo-Mitgliedschaft, Stufe 2 (Preis aus Billing-Einstellungen).',
    pricing: { kind: 'stage', stage: 2 },
  },
  {
    id: 'web_paket',
    label: 'Web-Paket',
    description: 'Website inkl. laufender Bereitstellung. Basis der kleinen Mitgliedschaft.',
    pricing: { kind: 'flat', netCents: 34000 }, // 340 € netto (fix)
  },
  {
    id: 'wartung',
    label: 'Wartung & Hosting',
    description: 'Laufende Wartung, Updates, Hosting. (Platzhalterpreis – anpassen.)',
    pricing: { kind: 'flat', netCents: 4900 }, // Platzhalter 49 €
  },
  {
    id: 'seo_beitraege',
    label: 'SEO-Beiträge',
    description: 'Regelmäßige SEO-Beiträge pro Monat. (Platzhalterpreis – anpassen.)',
    pricing: {
      kind: 'per_unit',
      netCents: 8000, // Platzhalter 80 € pro Beitrag
      unitLabel: 'Beiträge/Monat',
      defaultQty: 4,
      minQty: 0,
      maxQty: 30,
    },
  },
  {
    id: 'google_ads',
    label: 'Google Ads Betreuung',
    description:
      'Betreuungspauschale. Das Werbebudget zahlt der Kunde direkt an Google (fließt nicht in den Mitgliedspreis).',
    pricing: { kind: 'flat', netCents: 14900 }, // Platzhalter 149 €
    captureBudget: true,
  },
];

const MODULE_BY_ID = new Map(MEMBERSHIP_MODULES.map((m) => [m.id, m]));

/** Human label for a module id (falls back to the id if unknown). */
export function moduleLabel(id: string): string {
  return MODULE_BY_ID.get(id)?.label ?? id;
}

/** Module ids that were enabled in `before` but are no longer enabled in `after`. */
export function removedModuleIds(
  before: ModuleSelection[],
  after: ModuleSelection[],
): string[] {
  const afterEnabled = new Set(
    after.filter((s) => s.enabled).map((s) => s.id),
  );
  return before
    .filter((s) => s.enabled && !afterEnabled.has(s.id))
    .map((s) => s.id);
}

/** Aktive Auswahl eines Moduls in einer Mitgliedschaft. */
export interface ModuleSelection {
  id: string;
  enabled: boolean;
  /** Menge bei per_unit-Modulen (sonst ignoriert). */
  qty?: number;
  /** Erfasstes Budget in Cent (bei captureBudget-Modulen, rein informativ). */
  budgetCents?: number;
}

/** Stage-Preise aus den Billing-Settings, für stage-Module. */
export interface PriceContext {
  stage1NetCents: number;
  stage2NetCents: number;
}

function clampQty(def: ModuleDef, qty: number | undefined): number {
  if (def.pricing.kind !== 'per_unit') return 1;
  const q = Number.isFinite(qty) ? Math.round(qty as number) : def.pricing.defaultQty;
  return Math.min(def.pricing.maxQty, Math.max(def.pricing.minQty, q));
}

/** Netto-Monatspreis EINES Moduls (0, wenn nicht aktiv oder unbekannt). */
export function moduleMonthlyCents(
  sel: ModuleSelection,
  ctx: PriceContext,
): number {
  const def = MODULE_BY_ID.get(sel.id);
  if (!def || !sel.enabled) return 0;
  const p = def.pricing;
  if (p.kind === 'flat') return p.netCents;
  if (p.kind === 'per_unit') return p.netCents * clampQty(def, sel.qty);
  // stage
  return p.stage === 2 ? ctx.stage2NetCents : ctx.stage1NetCents;
}

/** Gesamter Netto-Monatspreis aller aktiven Module. */
export function totalMonthlyCents(
  selections: ModuleSelection[],
  ctx: PriceContext,
): number {
  return selections.reduce((sum, s) => sum + moduleMonthlyCents(s, ctx), 0);
}

/** Voreinstellungen: ein Klick füllt den Baukasten. */
export interface Preset {
  id: string;
  label: string;
  selections: ModuleSelection[];
}

export const MEMBERSHIP_PRESETS: Preset[] = [
  {
    id: 'web',
    label: 'Web-Paket (klein)',
    selections: [
      { id: 'web_paket', enabled: true },
      { id: 'wartung', enabled: true },
    ],
  },
  {
    id: 'supevo_stage1',
    label: 'supevo Stage 1',
    selections: [{ id: 'supevo_stage1', enabled: true }],
  },
  {
    id: 'supevo_stage2',
    label: 'supevo Stage 2',
    selections: [{ id: 'supevo_stage2', enabled: true }],
  },
];

/** Normalisiert eine (evtl. aus der DB gelesene) Auswahl auf gültige Module. */
export function normalizeSelections(raw: unknown): ModuleSelection[] {
  if (!Array.isArray(raw)) return [];
  const out: ModuleSelection[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const id = (r as { id?: unknown }).id;
    if (typeof id !== 'string' || !MODULE_BY_ID.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      enabled: (r as { enabled?: unknown }).enabled !== false,
      qty:
        typeof (r as { qty?: unknown }).qty === 'number'
          ? (r as { qty: number }).qty
          : undefined,
      budgetCents:
        typeof (r as { budgetCents?: unknown }).budgetCents === 'number'
          ? (r as { budgetCents: number }).budgetCents
          : undefined,
    });
  }
  return out;
}

/** Erster Tag des Folgemonats (YYYY-MM-01) – Änderungen gelten ab dann. */
export function firstOfNextMonth(from: Date = new Date()): string {
  const y = from.getFullYear();
  const m = from.getMonth(); // 0-based
  const next = m === 11 ? new Date(y + 1, 0, 1) : new Date(y, m + 1, 1);
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  return `${next.getFullYear()}-${mm}-01`;
}
