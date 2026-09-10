'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const platformSchema = z.enum(['meta', 'google']);

/** Löst zu einer Aufgabe Organisation + Kunde auf (RLS-geprüft). */
async function taskOrgClient(taskId: string): Promise<{
  orgId: string;
  clientCompanyId: string | null;
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('organization_id, project_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return null;
  const { data: project } = await supabase
    .from('projects')
    .select('client_company_id')
    .eq('id', task.project_id)
    .maybeSingle();
  return {
    orgId: task.organization_id,
    clientCompanyId: project?.client_company_id ?? null,
  };
}

/**
 * „Wir legen das Budget aus": Aufgabe als geklärt markieren und ein Ads-Mandat
 * für Kunde + Plattform anlegen/aktivieren (verantwortlich = aktueller Nutzer).
 */
export async function confirmAdsWeBillAction(input: {
  taskId: string;
  platform: 'meta' | 'google';
}): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(input.taskId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const platform = platformSchema.safeParse(input.platform);
  if (!platform.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const ctx = await taskOrgClient(input.taskId);
  if (!ctx) return errorResult(de.errors.FORBIDDEN);
  if (!ctx.clientCompanyId) {
    return errorResult('Aufgabe hat keinen Kunden – Ads-Mandat nicht möglich.');
  }

  const service = createSupabaseServiceClient();
  // Mandat pro Kunde+Plattform (idempotent): anlegen oder wieder aktivieren.
  const { error: mErr } = await service.from('ads_mandates').upsert(
    {
      organization_id: ctx.orgId,
      client_company_id: ctx.clientCompanyId,
      platform: platform.data,
      responsible_user_id: user.id,
      active: true,
      started_month: `${new Date().getFullYear()}-${String(
        new Date().getMonth() + 1,
      ).padStart(2, '0')}-01`,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: 'client_company_id,platform' },
  );
  if (mErr) return errorResult(de.errors.INTERNAL);

  await service
    .from('tasks')
    .update({
      ads_billing_status: 'confirmed',
      ads_flagged_at: new Date().toISOString(),
    } as never)
    .eq('id', input.taskId);

  revalidatePath('/app/ads');
  return successResult('Ads-Mandat angelegt – läuft jetzt monatlich.');
}

/** „Kunde zahlt selbst": kein Mandat, Aufgabe als geklärt markieren. */
export async function markAdsSelfPaidAction(input: {
  taskId: string;
}): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(input.taskId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const ctx = await taskOrgClient(input.taskId);
  if (!ctx) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  await service
    .from('tasks')
    .update({ ads_billing_status: 'self_paid' } as never)
    .eq('id', input.taskId);
  return successResult('Als „Kunde zahlt selbst" markiert.');
}

/** „Kein Ads / doch nicht relevant": Rückfrage ausblenden. */
export async function dismissAdsBillingAction(input: {
  taskId: string;
}): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(input.taskId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const ctx = await taskOrgClient(input.taskId);
  if (!ctx) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  await service
    .from('tasks')
    .update({ ads_billing_status: 'dismissed' } as never)
    .eq('id', input.taskId);
  return successResult('Hinweis ausgeblendet.');
}

/** Löst zu einem Mandat die Organisation auf (RLS-geprüft). */
async function mandateOrg(mandateId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('ads_mandates')
    .select('organization_id')
    .eq('id', mandateId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

const feeSchema = z.object({
  mandateId: z.string().uuid(),
  feeCents: z.number().int().min(0).max(100_000_00).nullable(),
});

/** Setzt die monatliche Kundenpauschale eines Mandats. */
export async function setAdsMandateFeeAction(input: {
  mandateId: string;
  feeCents: number | null;
}): Promise<ActionResult> {
  const parsed = feeSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  if (!(await mandateOrg(parsed.data.mandateId))) {
    return errorResult(de.errors.FORBIDDEN);
  }
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('ads_mandates')
    .update({ monthly_fee_cents: parsed.data.feeCents } as never)
    .eq('id', parsed.data.mandateId);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/ads');
  return successResult('Pauschale gespeichert.');
}

/** Mandat aktiv/inaktiv schalten (z. B. Kampagne pausiert/beendet). */
export async function setAdsMandateActiveAction(input: {
  mandateId: string;
  active: boolean;
}): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(input.mandateId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  if (!(await mandateOrg(input.mandateId))) return errorResult(de.errors.FORBIDDEN);
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('ads_mandates')
    .update({ active: Boolean(input.active) } as never)
    .eq('id', input.mandateId);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/ads');
  return successResult(input.active ? 'Mandat aktiviert.' : 'Mandat pausiert.');
}

const monthSchema = z.object({
  mandateId: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

async function upsertEntry(
  mandateId: string,
  orgId: string,
  year: number,
  month: number,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const service = createSupabaseServiceClient();
  const { error } = await service.from('ads_monthly_entries').upsert(
    {
      organization_id: orgId,
      mandate_id: mandateId,
      month: `${year}-${String(month).padStart(2, '0')}-01`,
      ...patch,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: 'mandate_id,month' },
  );
  return !error;
}

/** Trägt den im Monat verbrauchten Ad-Betrag ein (Mitarbeiter-Angabe). */
export async function recordAdsMonthSpentAction(input: {
  mandateId: string;
  year: number;
  month: number;
  spentCents: number | null;
}): Promise<ActionResult> {
  const parsed = monthSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  if (
    input.spentCents != null &&
    (!Number.isInteger(input.spentCents) || input.spentCents < 0)
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = await mandateOrg(parsed.data.mandateId);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const ok = await upsertEntry(
    parsed.data.mandateId,
    orgId,
    parsed.data.year,
    parsed.data.month,
    {
      spent_cents: input.spentCents,
      recorded_by: user.id,
      recorded_at: new Date().toISOString(),
    },
  );
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/ads');
  return successResult('Verbrauch gespeichert.');
}

/** Hakt einen Monat als (nicht) abgerechnet ab. */
export async function toggleAdsMonthBilledAction(input: {
  mandateId: string;
  year: number;
  month: number;
  billed: boolean;
}): Promise<ActionResult> {
  const parsed = monthSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = await mandateOrg(parsed.data.mandateId);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const ok = await upsertEntry(
    parsed.data.mandateId,
    orgId,
    parsed.data.year,
    parsed.data.month,
    { billed: Boolean(input.billed) },
  );
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/ads');
  return successResult(input.billed ? 'Als abgerechnet markiert.' : 'Haken entfernt.');
}
