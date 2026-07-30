'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { createNotifications } from '@/features/notifications/create';
import { resolveClientQueue, embedItems } from '@/features/marketing-plan/embed';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

type Service = ReturnType<typeof createSupabaseServiceClient>;

async function requireAdminOrg(): Promise<string | null> {
  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  return orgId && isOrgAdmin(user, orgId) ? orgId : null;
}

/** Loads a plan and checks it belongs to the given org. */
async function planForOrg(service: Service, planId: string, orgId: string) {
  const { data } = await service
    .from('marketing_plans')
    .select('id, organization_id, client_company_id, year, status')
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

// --- Agentur ---------------------------------------------------------------

const createSchema = z.object({
  clientCompanyId: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  title: z.string().trim().max(140).optional().or(z.literal('')),
});

export async function createPlanAction(input: unknown): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Werte.');
  const orgId = await requireAdminOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const user = await requireUser();

  const service = createSupabaseServiceClient();
  const { error } = await service.from('marketing_plans').insert({
    organization_id: orgId,
    client_company_id: parsed.data.clientCompanyId,
    year: parsed.data.year,
    title: parsed.data.title || 'Marketingplan',
    created_by: user.id,
  });
  if (error) {
    return errorResult(
      error.code === '23505'
        ? 'Für dieses Jahr existiert bereits ein Plan.'
        : 'Anlegen fehlgeschlagen.',
    );
  }
  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  return successResult('Plan angelegt.');
}

const addItemSchema = z.object({
  planId: z.string().uuid(),
  month: z.coerce.number().int().min(1).max(12),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
});

export async function addPlanItemAction(input: unknown): Promise<ActionResult> {
  const parsed = addItemSchema.safeParse(input);
  if (!parsed.success) return errorResult('Bitte Monat + Titel angeben.');
  const orgId = await requireAdminOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');

  const service = createSupabaseServiceClient();
  const plan = await planForOrg(service, parsed.data.planId, orgId);
  if (!plan) return errorResult('Plan nicht gefunden.');

  const { error } = await service.from('marketing_plan_items').insert({
    plan_id: parsed.data.planId,
    month: parsed.data.month,
    title: parsed.data.title,
    description: parsed.data.description || null,
    position: Date.now(),
  });
  if (error) return errorResult('Hinzufügen fehlgeschlagen.');
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Maßnahme hinzugefügt.');
}

const updateItemSchema = z.object({
  itemId: z.string().uuid(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(4000).optional(),
});

export async function updatePlanItemAction(input: unknown): Promise<ActionResult> {
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Werte.');
  const orgId = await requireAdminOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');

  const service = createSupabaseServiceClient();
  const patch: {
    month?: number;
    title?: string;
    description?: string | null;
    updated_at: string;
  } = { updated_at: new Date().toISOString() };
  if (parsed.data.month) patch.month = parsed.data.month;
  if (parsed.data.title) patch.title = parsed.data.title;
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description || null;

  // Ownership via the item's plan org (admin RLS also guards).
  const plan = await planForItem(service, parsed.data.itemId);
  if (!plan || plan.organization_id !== orgId) return errorResult('Nicht gefunden.');

  const { error } = await service
    .from('marketing_plan_items')
    .update(patch)
    .eq('id', parsed.data.itemId);
  if (error) return errorResult('Speichern fehlgeschlagen.');
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Gespeichert.');
}

export async function deletePlanItemAction(itemId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(itemId).success) return errorResult('Ungültig.');
  const orgId = await requireAdminOrg();
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
  const orgId = await requireAdminOrg();
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
        body: `Euer Marketingplan ${plan.year} liegt zur Abstimmung bereit.`,
        entityType: 'marketing_plan',
        entityId: planId,
      })),
    );
  }
  revalidatePath(`/app/clients/${plan.client_company_id}`);
  return successResult('Zur Abstimmung an den Kunden gesendet.');
}

/**
 * Agency: embeds accepted plan items as kanban tasks in the client's first
 * project (queue column), due-dated to the item's month. Idempotent per item
 * (already-embedded items are skipped).
 */
export async function embedPlanAction(planId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(planId).success) return errorResult('Ungültig.');
  const orgId = await requireAdminOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const user = await requireUser();
  const service = createSupabaseServiceClient();
  const plan = await planForOrg(service, planId, orgId);
  if (!plan) return errorResult('Plan nicht gefunden.');

  const target = await resolveClientQueue(service, plan.client_company_id);
  if (!target) return errorResult('Der Kunde hat noch kein Projekt/Board.');

  const { data: items } = await service
    .from('marketing_plan_items')
    .select('id, month, title, description')
    .eq('plan_id', planId)
    .in('status', ['accepted', 'proposed', 'change_requested']);
  if (!items || items.length === 0) {
    return errorResult('Keine übernehmbaren Maßnahmen (bereits übernommen?).');
  }

  const embedded = await embedItems(
    service,
    {
      orgId,
      clientCompanyId: plan.client_company_id,
      year: plan.year,
      createdBy: user.id,
      target,
    },
    items,
  );

  revalidatePath(`/app/clients/${plan.client_company_id}`);
  revalidatePath(`/app/projects/${target.projectId}`);
  return successResult(`${embedded} Maßnahme(n) ins Kanban übernommen.`);
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
    .select('id, client_company_id, organization_id, year')
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
        body: `${user.fullName ?? user.email} hat den Marketingplan ${plan.year} akzeptiert.`,
        entityType: 'marketing_plan',
        entityId: planId,
      })),
      user.id,
    );
  }
  revalidatePath('/portal/plan');
  return successResult('Plan akzeptiert – danke!');
}
