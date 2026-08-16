'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { getCurrentUser } from '@/features/auth/session';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import {
  normalizeSelections,
  totalMonthlyCents,
  firstOfNextMonth,
  removedModuleIds,
  type PriceContext,
} from '@/features/memberships/modules';
import { notifyRemovedModules } from '@/features/memberships/configurator-queries';

const selectionSchema = z.object({
  id: z.string().min(1).max(64),
  enabled: z.boolean(),
  qty: z.number().int().min(0).max(1000).optional(),
  budgetCents: z.number().int().min(0).max(100_000_00).optional(),
});

const saveSchema = z.object({
  clientCompanyId: z.string().uuid(),
  name: z.string().trim().max(120).optional(),
  stage: z.union([z.literal(1), z.literal(2)]),
  selections: z.array(selectionSchema).max(50),
});

async function priceContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orgId: string,
): Promise<PriceContext> {
  const { data } = await supabase
    .from('billing_settings')
    .select('stage1_net_cents, stage2_net_cents')
    .eq('organization_id', orgId)
    .maybeSingle();
  return {
    stage1NetCents: data?.stage1_net_cents ?? 0,
    stage2NetCents: data?.stage2_net_cents ?? 0,
  };
}

/**
 * Saves a membership configuration for a client. Onboarding (no active modules
 * yet) applies immediately; any later change is SCHEDULED for the first of next
 * month (so the running invoice keeps the old price). Only the agency
 * (org-admin/super-admin) may set it here; client self-service is Phase 2.
 */
export async function saveMembershipConfigAction(input: unknown): Promise<ActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, name, stage } = parsed.data;
  const selections = normalizeSelections(parsed.data.selections);

  const supabase = await createSupabaseServerClient();
  const { data: client } = await supabase
    .from('client_companies')
    .select('organization_id, name')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!client) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: client.organization_id });

  const ctx = await priceContext(supabase, client.organization_id);
  const netCents = totalMonthlyCents(selections, ctx);
  const label = name?.trim() || 'Individuell';

  const { data: existing } = await supabase
    .from('client_memberships')
    .select('id, modules')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();

  const activeIsEmpty =
    !existing || normalizeSelections(existing.modules).length === 0;

  // Onboarding / erste Einrichtung → sofort aktiv. Sonst → zum Folgemonat planen.
  if (activeIsEmpty) {
    const payload = {
      modules: selections as unknown,
      custom_net_cents: netCents,
      custom_name: label,
      stage,
      pending_modules: null,
      pending_effective_date: null,
    };
    if (existing) {
      const { error } = await supabase
        .from('client_memberships')
        .update(payload)
        .eq('id', existing.id);
      if (error) return errorResult(de.errors.INTERNAL);
    } else {
      const { error } = await supabase.from('client_memberships').insert({
        organization_id: client.organization_id,
        client_company_id: clientCompanyId,
        ...payload,
      });
      if (error) return errorResult(de.errors.INTERNAL);
    }
    revalidatePath(`/app/clients/${clientCompanyId}`);
    return successResult('Mitgliedschaft eingerichtet und aktiv.');
  }

  // Bestehende aktive Konfiguration → Änderung zum Folgemonat planen.
  const effectiveDate = firstOfNextMonth();
  const before = normalizeSelections(existing!.modules);
  const { error } = await supabase
    .from('client_memberships')
    .update({
      pending_modules: {
        selections,
        netCents,
        name: label,
        stage,
      } as unknown,
      pending_effective_date: effectiveDate,
    })
    .eq('id', existing!.id);
  if (error) return errorResult(de.errors.INTERNAL);

  // Phase 3: abgewählte Module dem Team melden (Maßnahmen beenden).
  await notifyRemovedModules({
    orgId: client.organization_id,
    clientCompanyId,
    companyName: client.name,
    removedIds: removedModuleIds(before, selections),
    effectiveDate,
    actorId: user.id,
  });

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult(`Änderung gespeichert – gültig ab ${effectiveDate}.`);
}

/** Agency: unlock/lock the portal self-service configurator for a client. */
export async function setMembershipClientEditAction(
  clientCompanyId: string,
  canEdit: boolean,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(clientCompanyId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const { data: client } = await supabase
    .from('client_companies')
    .select('organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!client) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: client.organization_id });

  const { error } = await supabase
    .from('client_memberships')
    .update({ client_can_edit: canEdit })
    .eq('client_company_id', clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult(
    canEdit
      ? 'Kunde kann seine Mitgliedschaft jetzt selbst anpassen.'
      : 'Selbstbedienung deaktiviert.',
  );
}

const portalSaveSchema = z.object({
  name: z.string().trim().max(120).optional(),
  stage: z.union([z.literal(1), z.literal(2)]),
  selections: z.array(selectionSchema).max(50),
});

/**
 * Portal (Kunde): der Kunde passt seine eigene Mitgliedschaft an. Nur erlaubt für
 * LEGACY-Kunden, die von der Agentur freigeschaltet wurden (client_can_edit).
 * Änderungen gelten immer erst zum Folgemonat. Gate über die RLS-Sicht auf die
 * eigene Mitgliedschaft; der Schreibvorgang läuft über den Service-Client.
 */
export async function savePortalMembershipConfigAction(input: unknown): Promise<ActionResult> {
  const parsed = portalSaveSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { name, stage } = parsed.data;
  const selections = normalizeSelections(parsed.data.selections);

  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.FORBIDDEN);

  // RLS-Sicht: der Kunde sieht nur seine eigene Mitgliedschaft → das ist die
  // Autorisierung. Ohne Zeile / nicht freigeschaltet → verboten.
  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase
    .from('client_memberships')
    .select('id, client_company_id, organization_id, modules, client_can_edit')
    .limit(1)
    .maybeSingle();
  if (!membership) return errorResult(de.errors.FORBIDDEN);

  const { data: company } = await supabase
    .from('client_companies')
    .select('name, is_legacy')
    .eq('id', membership.client_company_id)
    .maybeSingle();

  if (!company?.is_legacy || !membership.client_can_edit) {
    return errorResult('Anpassung ist für dieses Konto nicht freigeschaltet.');
  }

  const service = createSupabaseServiceClient();
  const { data: s } = await service
    .from('billing_settings')
    .select('stage1_net_cents, stage2_net_cents')
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  const ctx: PriceContext = {
    stage1NetCents: s?.stage1_net_cents ?? 0,
    stage2NetCents: s?.stage2_net_cents ?? 0,
  };
  const netCents = totalMonthlyCents(selections, ctx);
  const label = name?.trim() || 'Individuell';
  const effectiveDate = firstOfNextMonth();
  const before = normalizeSelections(membership.modules);

  const { error } = await service
    .from('client_memberships')
    .update({
      pending_modules: { selections, netCents, name: label, stage } as unknown,
      pending_effective_date: effectiveDate,
    })
    .eq('id', membership.id);
  if (error) return errorResult(de.errors.INTERNAL);

  await notifyRemovedModules({
    orgId: membership.organization_id,
    clientCompanyId: membership.client_company_id,
    companyName: company.name,
    removedIds: removedModuleIds(before, selections),
    effectiveDate,
    actorId: user.id,
  });

  revalidatePath('/portal/membership');
  return successResult(`Änderung gespeichert – gültig ab ${effectiveDate}.`);
}

/** Discards a scheduled (pending) change without touching the active config. */
export async function cancelPendingMembershipChangeAction(
  clientCompanyId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(clientCompanyId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const { data: client } = await supabase
    .from('client_companies')
    .select('organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!client) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: client.organization_id });

  const { error } = await supabase
    .from('client_memberships')
    .update({ pending_modules: null, pending_effective_date: null })
    .eq('client_company_id', clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Geplante Änderung verworfen.');
}
