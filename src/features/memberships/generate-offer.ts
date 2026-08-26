import 'server-only';
import { randomUUID } from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { berlinToday } from '@/lib/time';
import { nextRunAfter } from '@/features/recurring/recurrence';
import {
  normalizeSelections,
  type ModuleDef,
  type ModuleDelivery,
  type ModuleSelection,
} from '@/features/memberships/modules';
import { getModuleCatalog } from '@/features/memberships/catalog-queries';

type Service = ReturnType<typeof createSupabaseServiceClient>;

/** Basis-Modul (supevo Smart o. Ä.) – markiert oder ein Stufen-Modul. */
function isBaseModule(def: ModuleDef): boolean {
  return def.delivery.isBase || def.pricing.kind === 'stage';
}

/**
 * Umsetzungs-Verhalten eines Moduls – mit sinnvollen Defaults, damit „Aus
 * Angebot erzeugen" sofort funktioniert, ohne dass jedes Modul einzeln
 * konfiguriert werden muss. Explizit gesetztes Verhalten hat Vorrang.
 * Default: Basis → Daueraufgabe (nicht in den Plan); jedes andere Modul → als
 * Plan-Maßnahme UND als wiederkehrende Aufgabe.
 */
function effectiveDelivery(def: ModuleDef): ModuleDelivery {
  const d = def.delivery;
  const hasExplicit = d.planInclude || d.taskMode !== 'none';
  if (hasExplicit) return d;
  if (isBaseModule(def)) {
    return {
      ...d,
      planInclude: false,
      taskMode: 'recurring',
      taskRecurringFreq: d.taskRecurringFreq ?? 'monthly',
    };
  }
  return {
    ...d,
    planInclude: true,
    taskMode: 'recurring',
    taskRecurringFreq: d.taskRecurringFreq ?? 'monthly',
  };
}

export interface GenerateOfferResult {
  planItems: number;
  queueTasks: number;
  recurringTasks: number;
  skipped: string[];
  /** Anzahl gewählter Module mit hinterlegtem Umsetzungs-Verhalten. */
  configured: number;
}

/** Menge einer Auswahl (mind. 1). */
function selQty(def: ModuleDef, sel: ModuleSelection): number {
  if (def.pricing.kind !== 'per_unit') return 1;
  const q = Math.round(sel.qty ?? def.pricing.defaultQty ?? 1);
  return Math.max(1, q);
}

/** Zusatz-Infos (Menge, Keywords, Budget) als Klammer-Text für Labels. */
function extrasFor(def: ModuleDef, sel: ModuleSelection): string {
  const extras: string[] = [];
  if (def.pricing.kind === 'per_unit' && sel.qty) {
    extras.push(`${sel.qty} ${def.pricing.unitLabel}`);
  }
  if (def.keywordCents > 0 || (def.keywordDefault ?? 0) > 0) {
    const kw = sel.keywords ?? def.keywordDefault;
    if (kw) extras.push(`${kw} Keywords`);
  }
  if (def.captureBudget && sel.budgetCents) {
    extras.push(`Werbebudget ${Math.round(sel.budgetCents / 100)} €/Monat`);
  }
  return extras.length ? ` (${extras.join(', ')})` : '';
}

/** Titel einer Maßnahme/Aufgabe für ein Modul (inkl. Zusatz-Infos). */
function moduleTitle(def: ModuleDef, sel: ModuleSelection): string {
  return `${def.label}${extrasFor(def, sel)}`;
}

/** Findet das erste (nicht gelöschte) Projekt des Kunden oder legt eines an. */
async function ensureClientProject(
  service: Service,
  orgId: string,
  clientCompanyId: string,
  clientName: string,
  userId: string,
): Promise<string | null> {
  const { data: project } = await service
    .from('projects')
    .select('id')
    .eq('client_company_id', clientCompanyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (project) return project.id;

  const projectId = randomUUID();
  const { error } = await service.from('projects').insert({
    id: projectId,
    organization_id: orgId,
    client_company_id: clientCompanyId,
    name: `${clientName} – Umsetzung`,
    status: 'active',
    // Für den Kunden sichtbar – das Board ist für ihn gedacht (im Portal
    // schreibgeschützt). Die Agentur kann die Sichtbarkeit später umstellen.
    is_client_visible: true,
    lead_user_id: userId,
    created_by: userId,
  });
  if (error) return null;
  return projectId;
}

/** Warteschlangen-Spalte des ersten Boards eines Projekts. */
async function queueColumn(
  service: Service,
  projectId: string,
): Promise<{ boardId: string; columnId: string } | null> {
  const { data: board } = await service
    .from('boards')
    .select('id')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!board) return null;
  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key, position')
    .eq('board_id', board.id)
    .order('position', { ascending: true });
  const target =
    (columns ?? []).find((c) => c.column_key === 'queue') ?? (columns ?? [])[0];
  if (!target) return null;
  return { boardId: board.id, columnId: target.id };
}

/**
 * Erzeugt aus der gespeicherten Modulauswahl eines Kunden Marketingplan-Maßnahmen
 * und Aufgaben (Warteschlange + wiederkehrend) – gemäß dem je Modul im Katalog
 * hinterlegten Umsetzungs-Verhalten. Nur wenn eine supevo-Stufe (Basis) gewählt
 * wurde. Idempotent über Titel-Abgleich (bereits vorhandene werden übersprungen).
 */
export async function generateOfferDelivery(
  orgId: string,
  clientCompanyId: string,
  userId: string,
): Promise<GenerateOfferResult | { error: string }> {
  const service = createSupabaseServiceClient();

  const { data: membership } = await service
    .from('client_memberships')
    .select('modules')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  if (!membership) return { error: 'Keine Mitgliedschaft für diesen Kunden gefunden.' };

  const selections = normalizeSelections(membership.modules).filter((s) => s.enabled);
  if (selections.length === 0) {
    return { error: 'Es sind keine Module ausgewählt.' };
  }

  const catalog = await getModuleCatalog(orgId);
  const byKey = new Map(catalog.map((d) => [d.key, d]));
  const chosen = selections
    .map((s) => {
      const def = byKey.get(s.id);
      return def ? { sel: s, def, eff: effectiveDelivery(def) } : null;
    })
    .filter(
      (x): x is { sel: ModuleSelection; def: ModuleDef; eff: ModuleDelivery } => !!x,
    );

  const { data: company } = await service
    .from('client_companies')
    .select('name, is_legacy')
    .eq('id', clientCompanyId)
    .maybeSingle();
  const clientName = company?.name ?? 'Kunde';

  // Gate: supevo-Basis vorausgesetzt. Ein supevo-Kunde (nicht Legacy) hat die
  // Basis per Definition; sonst muss ein Basis-/Stufen-Modul gewählt sein.
  const hasBase = chosen.some((x) => isBaseModule(x.def));
  if (company?.is_legacy && !hasBase) {
    return {
      error:
        'Zum Erzeugen muss die supevo-Basis gewählt sein (Basis-Modul im Katalog markieren, z. B. supevo Smart – oder den Kunden als supevo-Kunde führen).',
    };
  }

  const projectId = await ensureClientProject(
    service,
    orgId,
    clientCompanyId,
    clientName,
    userId,
  );
  if (!projectId) return { error: 'Projekt konnte nicht angelegt/gefunden werden.' };

  // Wie viele der gewählten Module haben überhaupt ein Umsetzungs-Verhalten
  // hinterlegt? 0 = die je Modul konfigurierbaren Regeln sind noch nicht gesetzt.
  const configured = chosen.filter(
    (x) => x.eff.planInclude || x.eff.taskMode !== 'none',
  ).length;

  const skipped: string[] = [];
  let planItems = 0;
  let queueTasks = 0;
  let recurringTasks = 0;

  // --- Marketingplan-Maßnahmen ---------------------------------------------
  const planMods = chosen.filter((x) => x.eff.planInclude);
  if (planMods.length > 0) {
    // Plan sicherstellen.
    let planId: string | null = null;
    const { data: existingPlan } = await service
      .from('marketing_plans')
      .select('id')
      .eq('client_company_id', clientCompanyId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingPlan) {
      planId = existingPlan.id;
    } else {
      const { data: created } = await service
        .from('marketing_plans')
        .insert({
          organization_id: orgId,
          client_company_id: clientCompanyId,
          title: 'Marketingplan',
          created_by: userId,
        })
        .select('id')
        .single();
      planId = created?.id ?? null;
    }
    if (!planId) return { error: 'Marketingplan konnte nicht angelegt werden.' };

    // Bereits vorhandene Maßnahmen-Titel (Duplikate vermeiden).
    const { data: existingItems } = await service
      .from('marketing_plan_items')
      .select('title')
      .eq('plan_id', planId);
    const existingTitles = new Set((existingItems ?? []).map((i) => i.title));

    // Nach Phase gruppieren (planPhase; null → letzte „Laufende Maßnahmen").
    const groups = new Map<number, typeof planMods>();
    for (const m of planMods) {
      const key = m.eff.planPhase ?? 9999;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }
    const phaseKeys = [...groups.keys()].sort((a, b) => a - b);

    // Position der nächsten neuen Phase.
    const { data: lastPhase } = await service
      .from('marketing_plan_phases')
      .select('position')
      .eq('plan_id', planId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    let phasePos = lastPhase?.position ?? 0;

    for (const key of phaseKeys) {
      const mods = groups.get(key)!;
      const measures = mods
        .map((m) => moduleTitle(m.def, m.sel))
        .filter((t) => !existingTitles.has(t));
      if (measures.length === 0) continue;

      const phaseTitle = key === 9999 ? 'Laufende Maßnahmen' : `Phase ${key}`;
      const { data: phaseRow } = await service
        .from('marketing_plan_phases')
        .insert({
          plan_id: planId,
          title: phaseTitle,
          position: (phasePos += 1),
        })
        .select('id')
        .single();
      if (!phaseRow) continue;
      const rows = measures.map((title, i) => ({
        plan_id: planId!,
        phase_id: phaseRow.id,
        title,
        position: (i + 1) * 1000,
      }));
      const { error } = await service.from('marketing_plan_items').insert(rows);
      if (!error) {
        planItems += rows.length;
        for (const t of measures) existingTitles.add(t);
      }
    }
  }

  // --- Aufgaben (Warteschlange + wiederkehrend) ----------------------------
  const queueMods = chosen.filter((x) => x.eff.taskMode === 'queue');
  const recurringMods = chosen.filter((x) => x.eff.taskMode === 'recurring');

  if (queueMods.length > 0 || recurringMods.length > 0) {
    const col = await queueColumn(service, projectId);
    if (!col) return { error: 'Board/Warteschlange des Projekts nicht gefunden.' };

    // Vorhandene Aufgaben-Titel (offene) im Projekt, um Duplikate zu vermeiden.
    const { data: existingTasks } = await service
      .from('tasks')
      .select('title')
      .eq('project_id', projectId);
    const existingTaskTitles = new Set((existingTasks ?? []).map((t) => t.title));

    const { data: existingRecurring } = await service
      .from('recurring_tasks')
      .select('title')
      .eq('project_id', projectId);
    const existingRecurringTitles = new Set(
      (existingRecurring ?? []).map((t) => t.title),
    );

    let basePos = Date.now();
    const today = berlinToday();

    // Warteschlangen-Aufgaben. „Gestreckte" Module bekommen gestaffelte
    // Fälligkeiten (wochenweise, grob nach der Webseiten-Phase, ~ab Woche 4).
    let stretchWeek = 4;
    for (const { def, sel, eff } of queueMods) {
      const count = eff.taskPerQty ? selQty(def, sel) : 1;
      for (let n = 0; n < count; n += 1) {
        const baseTitle = moduleTitle(def, sel);
        const title = count > 1 ? `${baseTitle} – ${n + 1}` : baseTitle;
        if (existingTaskTitles.has(title)) {
          skipped.push(title);
          continue;
        }
        let dueDate: string | null = null;
        if (eff.taskStretchWeeks) {
          const d = new Date(`${today}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + stretchWeek * 7);
          dueDate = d.toISOString().slice(0, 10);
          stretchWeek += 1;
        }
        const { error } = await service.from('tasks').insert({
          organization_id: orgId,
          project_id: projectId,
          board_id: col.boardId,
          column_id: col.columnId,
          title,
          description: def.description || null,
          priority: 'medium',
          is_internal: false,
          due_date: dueDate,
          created_by: userId,
          position: (basePos += 1000),
        });
        if (!error) {
          queueTasks += 1;
          existingTaskTitles.add(title);
        }
      }
    }

    // Wiederkehrende (Dauer-)Aufgaben.
    for (const { def, sel, eff } of recurringMods) {
      const count = eff.taskPerQty ? selQty(def, sel) : 1;
      const frequency = eff.taskRecurringFreq ?? 'monthly';
      const weekday = frequency === 'weekly' ? 1 : null;
      const dayOfMonth = frequency === 'monthly' ? 1 : null;
      const nextRun = nextRunAfter(frequency, weekday, dayOfMonth, today);
      for (let n = 0; n < count; n += 1) {
        const baseTitle = moduleTitle(def, sel);
        const title = count > 1 ? `${baseTitle} – ${n + 1}` : baseTitle;
        if (existingRecurringTitles.has(title)) {
          skipped.push(title);
          continue;
        }
        const { error } = await service.from('recurring_tasks').insert({
          organization_id: orgId,
          project_id: projectId,
          column_id: col.columnId,
          title,
          description: def.description || null,
          priority: 'medium',
          is_internal: false,
          frequency,
          weekday,
          day_of_month: dayOfMonth,
          next_run_date: nextRun,
          created_by: userId,
        });
        if (!error) {
          recurringTasks += 1;
          existingRecurringTitles.add(title);
        }
      }
    }
  }

  return { planItems, queueTasks, recurringTasks, skipped, configured };
}
