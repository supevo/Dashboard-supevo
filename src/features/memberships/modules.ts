/**
 * Mitgliedschafts-Baukasten – reine, testbare Logik (kein server-only).
 *
 * Der Modulkatalog kommt jetzt aus der Datenbank (im Backend pflegbar) und wird
 * als ModuleDef[] übergeben; hier stehen nur noch Typen + Preis-/Gruppierlogik.
 */

export type ModulePricing =
  | { kind: 'flat'; netCents: number }
  | {
      kind: 'per_unit';
      netCents: number;
      unitLabel: string;
      defaultQty: number;
      minQty: number;
      maxQty: number;
    }
  // Preis kommt aus den Billing-Settings (Stage 1/2), nicht aus dem Modul.
  | { kind: 'stage'; stage: 1 | 2 };

export interface ModuleDef {
  /** Stabiler Schlüssel, unter dem die Auswahl gespeichert wird. */
  key: string;
  label: string;
  description: string;
  /** Emoji-Icon (im Stil der Dashboard-Icons) oder null. */
  icon: string | null;
  /** Kategoriename für die Gruppierung (null = ohne Kategorie). */
  category: string | null;
  categoryPosition: number;
  position: number;
  pricing: ModulePricing;
  captureBudget: boolean;
}

/** DB-Zeile (membership_modules) → ModuleDef. */
export interface ModuleRow {
  key: string;
  label: string;
  description: string | null;
  icon?: string | null;
  category_name?: string | null;
  category_position?: number | null;
  pricing_kind: string;
  net_cents: number;
  unit_label: string | null;
  default_qty: number;
  min_qty: number;
  max_qty: number;
  stage: number | null;
  capture_budget: boolean;
  position: number;
}

export function rowToModuleDef(r: ModuleRow): ModuleDef {
  let pricing: ModulePricing;
  if (r.pricing_kind === 'per_unit') {
    pricing = {
      kind: 'per_unit',
      netCents: r.net_cents,
      unitLabel: r.unit_label ?? 'Einheiten',
      defaultQty: r.default_qty,
      minQty: r.min_qty,
      maxQty: r.max_qty,
    };
  } else if (r.pricing_kind === 'stage') {
    pricing = { kind: 'stage', stage: r.stage === 2 ? 2 : 1 };
  } else {
    pricing = { kind: 'flat', netCents: r.net_cents };
  }
  return {
    key: r.key,
    label: r.label,
    description: r.description ?? '',
    icon: r.icon ?? null,
    category: r.category_name ?? null,
    categoryPosition: r.category_position ?? 0,
    position: r.position,
    pricing,
    captureBudget: r.capture_budget,
  };
}

/** Aktive Auswahl eines Moduls (referenziert das Modul über seinen key als id). */
export interface ModuleSelection {
  id: string;
  enabled: boolean;
  qty?: number;
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

/** Netto-Monatspreis EINES Moduls (0, wenn nicht aktiv). */
export function moduleMonthlyCents(
  def: ModuleDef,
  sel: ModuleSelection,
  ctx: PriceContext,
): number {
  if (!sel.enabled) return 0;
  const p = def.pricing;
  if (p.kind === 'flat') return p.netCents;
  if (p.kind === 'per_unit') return p.netCents * clampQty(def, sel.qty);
  return p.stage === 2 ? ctx.stage2NetCents : ctx.stage1NetCents;
}

/** Gesamter Netto-Monatspreis aller aktiven Module. */
export function totalMonthlyCents(
  defs: ModuleDef[],
  selections: ModuleSelection[],
  ctx: PriceContext,
): number {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  return selections.reduce((sum, s) => {
    const def = byKey.get(s.id);
    return def ? sum + moduleMonthlyCents(def, s, ctx) : sum;
  }, 0);
}

/** Label eines Moduls (fällt auf die id zurück, falls unbekannt). */
export function moduleLabel(defs: ModuleDef[], id: string): string {
  return defs.find((d) => d.key === id)?.label ?? id;
}

/** Module nach Kategorie gruppiert (für die saubere Frontend-Anzeige). */
export interface ModuleGroup {
  category: string | null;
  modules: ModuleDef[];
}
export function groupByCategory(defs: ModuleDef[]): ModuleGroup[] {
  const sorted = [...defs].sort(
    (a, b) =>
      a.categoryPosition - b.categoryPosition ||
      (a.category ?? '').localeCompare(b.category ?? '', 'de') ||
      a.position - b.position,
  );
  const groups: ModuleGroup[] = [];
  for (const d of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.category === d.category) last.modules.push(d);
    else groups.push({ category: d.category, modules: [d] });
  }
  return groups;
}

/** Modul-ids, die in `before` aktiv waren, in `after` aber nicht mehr. */
export function removedModuleIds(
  before: ModuleSelection[],
  after: ModuleSelection[],
): string[] {
  const afterEnabled = new Set(after.filter((s) => s.enabled).map((s) => s.id));
  return before
    .filter((s) => s.enabled && !afterEnabled.has(s.id))
    .map((s) => s.id);
}

/** Normalisiert eine (evtl. aus der DB gelesene) Auswahl. */
export function normalizeSelections(raw: unknown): ModuleSelection[] {
  if (!Array.isArray(raw)) return [];
  const out: ModuleSelection[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const id = (r as { id?: unknown }).id;
    if (typeof id !== 'string' || seen.has(id)) continue;
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
  const m = from.getMonth();
  const next = m === 11 ? new Date(y + 1, 0, 1) : new Date(y, m + 1, 1);
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  return `${next.getFullYear()}-${mm}-01`;
}
