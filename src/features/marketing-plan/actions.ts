'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/session';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { createNotifications } from '@/features/notifications/create';
import {
  resolveClientQueue,
  embedItems,
  ensureMarketingLabel,
} from '@/features/marketing-plan/embed';
import { DEFAULT_PLAN_TEMPLATE, type PlanTemplate } from './template';
import { generatePlanDraft } from './ai-draft';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

type Service = ReturnType<typeof createSupabaseServiceClient>;

/** Marketingpläne dürfen alle Agentur-Mitarbeiter verwalten (nicht nur Admins). */
async function requireAgencyOrg(): Promise<string | null> {
  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  return orgId && hasAgencyAccess(user) ? orgId : null;
}

/** Loads a plan and checks it belongs to the given org. */
async function planForOrg(service: Service, planId: string, orgId: string) {
  const { data } = await service
    .from('marketing_plans')
    .select('id, organization_id, client_company_id, status')
    .eq('id', planId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return data;
}

/** Loads the plan that an item belongs to (id, org, client). */
async function planForItem(service: Service, itemId: string) {
  const { data: item } = await service
    .from('marketing_plan_items')
    .select('plan_id')
    .eq('id', itemId)
    .maybeSingle();
  if (!item) return null;
  const { data: plan } = await service
    .from('marketing_plans')
    .select('id, organization_id, client_company_id')
    .eq('id', item.plan_id)
    .maybeSingle();
  return plan;
}

/** Loads the plan that a phase belongs to (id, org, client). */
async function planForPhase(service: Service, phaseId: string) {
  const { data: phase } = await service
    .from('marketing_plan_phases')
    .select('plan_id')
    .eq('id', phaseId)
    .maybeSingle();
  if (!phase) return null;
  const { data: plan } = await service
    .from('marketing_plans')
    .select('id, organization_id, client_company_id')
    .eq('id', phase.plan_id)
    .maybeSingle();
  return plan;
}

/** Returns the client's plan id, creating an empty plan if none exists yet. */
async function ensurePlan(
  service: Service,
  orgId: string,
  clientCompanyId: string,
  userId: string,
): Promise<{ id: string } | { error: string }> {
  const { data: existing } = await service
    .from('marketing_plans')
    .select('id')
    .eq('client_company_id', clientCompanyId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data, error } = await service
    .from('marketing_plans')
    .insert({
      organization_id: orgId,
      client_company_id: clientCompanyId,
      title: 'Marketingplan',
      created_by: userId,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[marketing-plan] ensurePlan insert failed', {
      code: error?.code,
      message: error?.message,
    });
    return {
      error:
        error?.code === '42P01'
          ? 'Marketingplan-Tabellen fehlen (Migration 0119 nicht ausgeführt).'
          : 'Anlegen fehlgeschlagen.',
    };
  }
  return { id: data.id };
}

/** Inserts template/AI phases + their measures into an (empty) plan. */
async function insertContent(
  service: Service,
  planId: string,
  content: PlanTemplate,
): Promise<void> {
  let phasePos = 0;
  for (const phase of content.phases) {
    const { data: row } = await service
      .from('marketing_plan_phases')
      .insert({
        plan_id: planId,
        title: phase.title,
        timeframe_hint: phase.timeframeHint || null,
        outcome: phase.outcome || null,
        position: (phasePos += 1),
      })
      .select('id')
      .single();
    if (!row) continue;
    const rows = phase.measures.map((title, i) => ({
      plan_id: planId,
      phase_id: row.id,
      title,
      position: (i + 1) * 1000,
    }));
    if (rows.length > 0) {
      await service.from('marketing_plan_items').insert(rows);
    }
  }
  if (content.closingNote) {
    await service
      .from('marketing_plans')
      .update({ closing_note: content.closingNote })
      .eq('id', planId);
  }
}

// --- Agentur: Plan-Grundgerüst ---------------------------------------------

const clientSchema = z.object({ clientCompanyId: z.string().uuid() });

export async function createPlanAction(input: unknown): Promise<ActionResult> {
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Werte.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const user = await requireUser();

  const service = createSupabaseServiceClient();
  const res = await ensurePlan(service, orgId, parsed.data.clientCompanyId, user.id);
  if ('error' in res) return errorResult(res.error);
  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  return successResult('Plan angelegt.');
}

/** Fills an (empty) plan with the agency's standard 5-phase template. */
export async function applyTemplateAction(input: unknown): Promise<ActionResult> {
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Werte.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const user = await requireUser();
  const service = createSupabaseServiceClient();

  const res = await ensurePlan(service, orgId, parsed.data.clientCompanyId, user.id);
  if ('error' in res) return errorResult(res.error);

  const { count } = await service
    .from('marketing_plan_phases')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', res.id);
  if ((count ?? 0) > 0) {
    return errorResult('Der Plan enthält bereits Phasen.');
  }

  await insertContent(service, res.id, DEFAULT_PLAN_TEMPLATE);
  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  return successResult('Vorlage eingefügt.');
}

/** Generates a plan draft via AI (falls back to the template) for an empty plan. */
export async function aiDraftPlanAction(input: unknown): Promise<ActionResult> {
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Werte.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const user = await requireUser();
  const service = createSupabaseServiceClient();

  const res = await ensurePlan(service, orgId, parsed.data.clientCompanyId, user.id);
  if ('error' in res) return errorResult(res.error);

  const { count } = await service
    .from('marketing_plan_phases')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', res.id);
  if ((count ?? 0) > 0) {
    return errorResult('Der Plan enthält bereits Phasen.');
  }

  const { data: company } = await service
    .from('client_companies')
    .select('name, industry, notes')
    .eq('id', parsed.data.clientCompanyId)
    .maybeSingle();

  const { plan, usedAi } = await generatePlanDraft({
    name: company?.name ?? 'Kunde',
    industry: company?.industry ?? null,
    notes: company?.notes ?? null,
  });
  await insertContent(service, res.id, plan);
  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  return successResult(
    usedAi
      ? 'KI-Entwurf erstellt – jetzt anpassen.'
      : 'KI nicht verfügbar – Vorlage eingefügt.',
  );
}

// --- Agentur: Phasen -------------------------------------------------------

const addPhaseSchema = z.object({
  planId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
});

export async function addPhaseAction(input: unknown): Promise<ActionResult> {
  const parsed = addPhaseSchema.safeParse(input);
  if (!parsed.success) return errorResult('Bitte einen Phasen-Titel angeben.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const service = createSupabaseServiceClient();
  const plan = await planForOrg(service, parsed.data.planId, orgId);
  if (!plan) return errorResult('Plan nicht gefunden.');

  const { data: last } = await service
    .from('marketing_plan_phases')
    .select('position')
    .eq('plan_id', parsed.data.planId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? 0) + 1;

  const { error } = await service.from('marketing_plan_phases').insert({
    plan_id: parsed.data.planId,
    title: parsed.data.title,
    position,
  });
  if (error) return errorResult('Hinzufügen fehlgeschlagen.');
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Phase hinzugefügt.');
}

const updatePhaseSchema = z.object({
  phaseId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  timeframeHint: z.string().trim().max(200).optional().or(z.literal('')),
  outcome: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function updatePhaseAction(input: unknown): Promise<ActionResult> {
  const parsed = updatePhaseSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Werte.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const service = createSupabaseServiceClient();
  const plan = await planForPhase(service, parsed.data.phaseId);
  if (!plan || plan.organization_id !== orgId) return errorResult('Nicht gefunden.');

  const { error } = await service
    .from('marketing_plan_phases')
    .update({
      title: parsed.data.title,
      timeframe_hint: parsed.data.timeframeHint || null,
      outcome: parsed.data.outcome || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.phaseId);
  if (error) return errorResult('Speichern fehlgeschlagen.');
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Phase gespeichert.');
}

export async function deletePhaseAction(phaseId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(phaseId).success) return errorResult('Ungültig.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const service = createSupabaseServiceClient();
  const plan = await planForPhase(service, phaseId);
  if (!plan || plan.organization_id !== orgId) return errorResult('Nicht gefunden.');
  await service.from('marketing_plan_phases').delete().eq('id', phaseId);
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Phase gelöscht.');
}

const movePhaseSchema = z.object({
  phaseId: z.string().uuid(),
  direction: z.enum(['up', 'down']),
});

/** Swaps a phase's position with its neighbour in the given direction. */
export async function movePhaseAction(input: unknown): Promise<ActionResult> {
  const parsed = movePhaseSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültig.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const service = createSupabaseServiceClient();
  const plan = await planForPhase(service, parsed.data.phaseId);
  if (!plan || plan.organization_id !== orgId) return errorResult('Nicht gefunden.');

  const { data: phases } = await service
    .from('marketing_plan_phases')
    .select('id, position')
    .eq('plan_id', plan.id)
    .order('position', { ascending: true });
  if (!phases) return errorResult('Nicht gefunden.');

  const idx = phases.findIndex((p) => p.id === parsed.data.phaseId);
  const swapIdx = parsed.data.direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= phases.length) {
    return successResult('Bereits am Rand.');
  }
  const a = phases[idx]!;
  const b = phases[swapIdx]!;
  await Promise.all([
    service
      .from('marketing_plan_phases')
      .update({ position: b.position })
      .eq('id', a.id),
    service
      .from('marketing_plan_phases')
      .update({ position: a.position })
      .eq('id', b.id),
  ]);
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Verschoben.');
}

const closingSchema = z.object({
  planId: z.string().uuid(),
  closingNote: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function updatePlanClosingAction(input: unknown): Promise<ActionResult> {
  const parsed = closingSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Werte.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const service = createSupabaseServiceClient();
  const plan = await planForOrg(service, parsed.data.planId, orgId);
  if (!plan) return errorResult('Plan nicht gefunden.');
  await service
    .from('marketing_plans')
    .update({
      closing_note: parsed.data.closingNote || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.planId);
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Gespeichert.');
}

// --- Agentur: Maßnahmen ----------------------------------------------------

const addItemSchema = z.object({
  phaseId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
});

export async function addPlanItemAction(input: unknown): Promise<ActionResult> {
  const parsed = addItemSchema.safeParse(input);
  if (!parsed.success) return errorResult('Bitte Titel der Maßnahme angeben.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const service = createSupabaseServiceClient();
  const plan = await planForPhase(service, parsed.data.phaseId);
  if (!plan || plan.organization_id !== orgId) return errorResult('Phase nicht gefunden.');

  const { data: last } = await service
    .from('marketing_plan_items')
    .select('position')
    .eq('phase_id', parsed.data.phaseId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? 0) + 1000;

  const { error } = await service.from('marketing_plan_items').insert({
    plan_id: plan.id,
    phase_id: parsed.data.phaseId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    position,
  });
  if (error) return errorResult('Hinzufügen fehlgeschlagen.');
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Maßnahme hinzugefügt.');
}

const updateItemSchema = z.object({
  itemId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
});

/** Edits a measure's title (and optional description). */
export async function updatePlanItemAction(input: unknown): Promise<ActionResult> {
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) return errorResult('Bitte Titel der Maßnahme angeben.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const service = createSupabaseServiceClient();
  const plan = await planForItem(service, parsed.data.itemId);
  if (!plan || plan.organization_id !== orgId) return errorResult('Nicht gefunden.');

  const { error } = await service
    .from('marketing_plan_items')
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.itemId);
  if (error) return errorResult('Speichern fehlgeschlagen.');
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Maßnahme gespeichert.');
}

export async function deletePlanItemAction(itemId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(itemId).success) return errorResult('Ungültig.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const service = createSupabaseServiceClient();
  const plan = await planForItem(service, itemId);
  if (!plan || plan.organization_id !== orgId) return errorResult('Nicht gefunden.');
  await service.from('marketing_plan_items').delete().eq('id', itemId);
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Gelöscht.');
}

/** Agency: releases the plan to the client for review; notifies client contacts. */
export async function releasePlanAction(planId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(planId).success) return errorResult('Ungültig.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const service = createSupabaseServiceClient();
  const plan = await planForOrg(service, planId, orgId);
  if (!plan) return errorResult('Plan nicht gefunden.');

  await service
    .from('marketing_plans')
    .update({ status: 'in_review', updated_at: new Date().toISOString() })
    .eq('id', planId);

  const { data: contacts } = await service
    .from('client_contacts')
    .select('user_id')
    .eq('client_company_id', plan.client_company_id);
  const recipients = (contacts ?? []).map((c) => c.user_id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: orgId,
        recipientId,
        type: 'task_for_approval' as const,
        title: 'Marketingplan zur Abstimmung',
        body: 'Euer Marketingplan liegt zur Abstimmung bereit.',
        entityType: 'marketing_plan',
        entityId: planId,
      })),
    );
  }
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Zur Abstimmung an den Kunden gesendet.');
}

/**
 * Embeds the open measures of ONE phase as kanban tasks in the client's queue
 * column, marked with the "Marketingplan" label (so the team recognises them as
 * auto-processed plan work). No due dates. Idempotent per item.
 */
async function embedOnePhase(
  service: Service,
  plan: { id: string; organization_id: string; client_company_id: string },
  phaseId: string,
  userId: string,
): Promise<ActionResult> {
  const target = await resolveClientQueue(service, plan.client_company_id);
  if (!target) return errorResult('Der Kunde hat noch kein Projekt/Board.');

  const [{ data: phase }, { data: items }] = await Promise.all([
    service
      .from('marketing_plan_phases')
      .select('id, title')
      .eq('id', phaseId)
      .maybeSingle(),
    service
      .from('marketing_plan_items')
      .select('id, title, description, position')
      .eq('phase_id', phaseId)
      .in('status', ['accepted', 'proposed', 'change_requested'])
      .order('position', { ascending: true }),
  ]);
  if (!items || items.length === 0) {
    return errorResult('Keine übernehmbaren Maßnahmen in dieser Phase (bereits übernommen?).');
  }

  const labelId = await ensureMarketingLabel(service, plan.organization_id);
  const embedded = await embedItems(
    service,
    { orgId: plan.organization_id, createdBy: userId, target, labelId },
    items.map((it) => ({
      id: it.id,
      title: it.title,
      description: it.description,
      phaseTitle: phase?.title ?? null,
    })),
  );

  revalidatePath(`/app/clients/${plan.client_company_id}`);
  revalidatePath(`/app/projects/${target.projectId}`);
  return successResult(
    `Phase „${phase?.title ?? ''}“: ${embedded} Maßnahme(n) ins Kanban übernommen.`,
  );
}

/** Agency: embeds a single, chosen phase into the client's board. */
export async function embedPlanPhaseAction(phaseId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(phaseId).success) return errorResult('Ungültig.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const user = await requireUser();
  const service = createSupabaseServiceClient();
  const plan = await planForPhase(service, phaseId);
  if (!plan || plan.organization_id !== orgId) return errorResult('Phase nicht gefunden.');
  return embedOnePhase(service, plan, phaseId, user.id);
}

/**
 * Agency: embeds the NEXT phase (by order) that still has open measures. The
 * plan is rolled out phase by phase, never all at once.
 */
export async function embedNextPhaseAction(planId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(planId).success) return errorResult('Ungültig.');
  const orgId = await requireAgencyOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const user = await requireUser();
  const service = createSupabaseServiceClient();
  const plan = await planForOrg(service, planId, orgId);
  if (!plan) return errorResult('Plan nicht gefunden.');

  const { data: phases } = await service
    .from('marketing_plan_phases')
    .select('id')
    .eq('plan_id', planId)
    .order('position', { ascending: true });
  for (const phase of phases ?? []) {
    const { count } = await service
      .from('marketing_plan_items')
      .select('id', { count: 'exact', head: true })
      .eq('phase_id', phase.id)
      .in('status', ['accepted', 'proposed', 'change_requested']);
    if ((count ?? 0) > 0) {
      return embedOnePhase(service, plan, phase.id, user.id);
    }
  }
  return errorResult('Alle Phasen sind bereits ins Kanban übernommen.');
}

// --- Kunde -----------------------------------------------------------------

/** Verifies the current user is a contact of the item's plan client, returns ctx. */
async function clientItemContext(itemId: string) {
  const company = await getMyClientCompany();
  if (!company) return null;
  const service = createSupabaseServiceClient();
  const plan = await planForItem(service, itemId);
  if (!plan || plan.client_company_id !== company.clientCompanyId) return null;
  return { service, orgId: plan.organization_id };
}

export async function clientAcceptItemAction(itemId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(itemId).success) return errorResult('Ungültig.');
  const ctx = await clientItemContext(itemId);
  if (!ctx) return errorResult('Keine Berechtigung.');
  await ctx.service
    .from('marketing_plan_items')
    .update({ status: 'accepted', client_note: null, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .in('status', ['proposed', 'change_requested']);
  revalidatePath('/portal/plan');
  return successResult('Maßnahme akzeptiert.');
}

const changeSchema = z.object({
  itemId: z.string().uuid(),
  note: z.string().trim().min(2).max(2000),
});

export async function clientRequestChangeAction(input: unknown): Promise<ActionResult> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return errorResult('Bitte kurz beschreiben, was geändert werden soll.');
  const ctx = await clientItemContext(parsed.data.itemId);
  if (!ctx) return errorResult('Keine Berechtigung.');
  const user = await requireUser();
  await ctx.service
    .from('marketing_plan_items')
    .update({
      status: 'change_requested',
      client_note: parsed.data.note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.itemId);

  // Notify org admins about the change request.
  const { data: admins } = await ctx.service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', ctx.orgId)
    .eq('status', 'active');
  const recipients = (admins ?? [])
    .filter((m) => m.role === 'agency_admin' || m.role === 'super_admin')
    .map((m) => m.user_id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: ctx.orgId,
        recipientId,
        type: 'changes_requested' as const,
        title: 'Marketingplan: Änderungswunsch',
        body: `${user.fullName ?? user.email}: ${parsed.data.note.slice(0, 140)}`,
        entityType: 'marketing_plan',
        entityId: null,
      })),
      user.id,
    );
  }
  revalidatePath('/portal/plan');
  return successResult('Änderungswunsch gesendet.');
}

export async function clientAcceptWholePlanAction(planId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(planId).success) return errorResult('Ungültig.');
  const company = await getMyClientCompany();
  if (!company) return errorResult('Keine Berechtigung.');
  const service = createSupabaseServiceClient();
  const { data: plan } = await service
    .from('marketing_plans')
    .select('id, client_company_id, organization_id')
    .eq('id', planId)
    .maybeSingle();
  if (!plan || plan.client_company_id !== company.clientCompanyId) {
    return errorResult('Keine Berechtigung.');
  }
  const user = await requireUser();

  // Accept every item that isn't already embedded.
  await service
    .from('marketing_plan_items')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('plan_id', planId)
    .in('status', ['proposed', 'change_requested']);
  await service
    .from('marketing_plans')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', planId);

  const { data: admins } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', plan.organization_id)
    .eq('status', 'active');
  const recipients = (admins ?? [])
    .filter((m) => m.role === 'agency_admin' || m.role === 'super_admin')
    .map((m) => m.user_id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: plan.organization_id,
        recipientId,
        type: 'approval_granted' as const,
        title: 'Marketingplan akzeptiert',
        body: `${user.fullName ?? user.email} hat den Marketingplan akzeptiert.`,
        entityType: 'marketing_plan',
        entityId: planId,
      })),
      user.id,
    );
  }
  revalidatePath('/portal/plan');
  return successResult('Plan akzeptiert – danke!');
}
