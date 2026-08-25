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
  /** Checkliste „Was ist enthalten" (im Frontend max. 5 Punkte). */
  features: string[];
  /** Emoji-Icon (im Stil der Dashboard-Icons) oder null. */
  icon: string | null;
  /** Kategoriename für die Gruppierung (null = ohne Kategorie). */
  category: string | null;
  categoryPosition: number;
  position: number;
  pricing: ModulePricing;
  captureBudget: boolean;
  /** Zahlweise-Auswahl anzeigen (über uns / direkt an Google). */
  budgetViaOptions: boolean;
  /** Preis pro Keyword in Cent (0 = keine Keyword-Skalierung). */
  keywordCents: number;
  keywordDefault: number;
  /** Key eines ANDEREN Moduls, das als Add-on dieses Moduls dient (dessen
   *  eigener Preis zählt, sobald es aktiviert wird). */
  addonModuleKey: string | null;
  /** Add-on ist Pflicht (Must-Have) → beim Aktivieren automatisch mit aktiv. */
  addonRequired: boolean;
  /** Umsetzungs-Verhalten: was beim „Aus Angebot erzeugen" entsteht. */
  delivery: ModuleDelivery;
}

export interface ModuleDelivery {
  /** Als Maßnahme in den Marketingplan. */
  planInclude: boolean;
  /** Optionale Phasen-Nummer (1..n); null = Standardphase. */
  planPhase: number | null;
  /** Aufgabe: keine / einmal in die Warteschlange / wiederkehrend (Dauer). */
  taskMode: 'none' | 'queue' | 'recurring';
  /** Nach Menge vervielfachen (2 gewählt = 2 Aufgaben). */
  taskPerQty: boolean;
  /** Für wiederkehrende Aufgaben: Takt. */
  taskRecurringFreq: 'weekly' | 'monthly' | null;
  /** Warteschlangen-Aufgaben über die Wochen gestaffelt (Fälligkeiten). */
  taskStretchWeeks: boolean;
}

/** DB-Zeile (membership_modules) → ModuleDef. */
export interface ModuleRow {
  key: string;
  label: string;
  description: string | null;
  features?: string[] | null;
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
  budget_via_options?: boolean | null;
  keyword_cents?: number | null;
  keyword_default?: number | null;
  addon_module_key?: string | null;
  addon_required?: boolean | null;
  position: number;
  plan_include?: boolean | null;
  plan_phase?: number | null;
  task_mode?: string | null;
  task_per_qty?: boolean | null;
  task_recurring_freq?: string | null;
  task_stretch_weeks?: boolean | null;
}

export function rowToModuleDef(r: ModuleRow): ModuleDef {
  let pricing: ModulePricing;
  if (r.pricing_kind === 'per_unit') {
    pricing = {
      kind: 'per_unit',
      netCents: r.net_cents,
      unitLabel: (r.unit_label ?? '').trim(),
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
    features: Array.isArray(r.features) ? r.features : [],
    icon: r.icon ?? null,
    category: r.category_name ?? null,
    categoryPosition: r.category_position ?? 0,
    position: r.position,
    pricing,
    captureBudget: r.capture_budget,
    budgetViaOptions: r.budget_via_options ?? false,
    keywordCents: r.keyword_cents ?? 0,
    keywordDefault: r.keyword_default ?? 0,
    addonModuleKey: r.addon_module_key ?? null,
    addonRequired: r.addon_required ?? false,
    delivery: {
      planInclude: r.plan_include ?? false,
      planPhase: r.plan_phase ?? null,
      taskMode:
        r.task_mode === 'queue' || r.task_mode === 'recurring'
          ? r.task_mode
          : 'none',
      taskPerQty: r.task_per_qty ?? false,
      taskRecurringFreq:
        r.task_recurring_freq === 'monthly'
          ? 'monthly'
          : r.task_recurring_freq === 'weekly'
            ? 'weekly'
            : null,
      taskStretchWeeks: r.task_stretch_weeks ?? false,
    },
  };
}

/** Aktive Auswahl eines Moduls (referenziert das Modul über seinen key als id). */
export interface ModuleSelection {
  id: string;
  enabled: boolean;
  qty?: number;
  budgetCents?: number;
  /** Zahlweise des Werbebudgets. */
  budgetVia?: 'us' | 'google';
  /** Anzahl geplanter Keywords (skaliert den Preis). */
  keywords?: number;
}

/** Stage-Preise aus den Billing-Settings, für stage-Module. */
export interface PriceContext {
  stage1NetCents: number;
  stage2NetCents: number;
}

function clampQty(def: ModuleDef, qty: number | undefined): number {
  if (def.pricing.kind !== 'per_unit') return 1;
  // Obergrenze absichern: Ein Pro-Einheit-Modul mit maxQty ≤ 1 ergibt keinen
  // Sinn (dafür gäbe es Fixpreis) – so ein Wert darf die Menge nicht kappen und
  // den Preis „einfrieren". Nur ein echtes Limit (> 1) begrenzt. Die Untergrenze
  // (minQty) bleibt erhalten.
  const upper =
    def.pricing.maxQty > 1
      ? def.pricing.maxQty
      : Math.max(99, def.pricing.defaultQty, def.pricing.minQty);
  const lower = Math.min(Math.max(0, def.pricing.minQty), upper);
  const fallback = Math.min(Math.max(1, def.pricing.defaultQty), upper);
  const q = Number.isFinite(qty) ? Math.round(qty as number) : fallback;
  return Math.min(upper, Math.max(lower, q));
}

/** Netto-Monatspreis EINES Moduls (0, wenn nicht aktiv). */
export function moduleMonthlyCents(
  def: ModuleDef,
  sel: ModuleSelection,
  ctx: PriceContext,
): number {
  if (!sel.enabled) return 0;
  const p = def.pricing;
  let cents =
    p.kind === 'flat'
      ? p.netCents
      : p.kind === 'per_unit'
        ? p.netCents * clampQty(def, sel.qty)
        : p.stage === 2
          ? ctx.stage2NetCents
          : ctx.stage1NetCents;

  // Keyword-Skalierung: Preis pro geplantem Keyword.
  if (def.keywordCents > 0) {
    const kw = Math.max(0, Math.round(sel.keywords ?? def.keywordDefault));
    cents += def.keywordCents * kw;
  }
  // Add-ons sind eigene Module (addonModuleKey) – ihr Preis zählt über ihr
  // eigenes enabled, nicht hier.
  return cents;
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
    const rec = r as Record<string, unknown>;
    const num = (k: string) =>
      typeof rec[k] === 'number' ? (rec[k] as number) : undefined;
    out.push({
      id,
      enabled: rec.enabled !== false,
      qty: num('qty'),
      budgetCents: num('budgetCents'),
      keywords: num('keywords'),
      budgetVia:
        rec.budgetVia === 'us' || rec.budgetVia === 'google'
          ? (rec.budgetVia as 'us' | 'google')
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
