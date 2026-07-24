'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { parseEuroToCents } from '@/lib/money';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const optStr = z.string().trim().max(300).optional().or(z.literal(''));

const schema = z.object({
  orgId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  stage: z.coerce.number().int().min(1).max(2),
  custom_enabled: z.coerce.boolean(),
  custom_name: optStr,
  custom_price: optStr,
  interval_months: z.coerce.number().int().refine((v) => [1, 3, 12].includes(v)),
  billing_day: z.coerce.number().int().min(1).max(28),
  payment_method: z.enum(['sepa', 'transfer']),
  status: z.enum(['active', 'paused', 'canceled']),
  start_date: z.string().min(1),
  auto_send: z.coerce.boolean(),
  mandate_reference: optStr,
  mandate_date: optStr,
  debtor_iban: optStr,
  debtor_bic: optStr,
  billing_name: optStr,
  billing_address_line1: optStr,
  billing_address_line2: optStr,
  billing_postal_code: optStr,
  billing_city: optStr,
  billing_country: optStr,
  billing_vat_id: optStr,
});

/** Computes the next billing date on/after today for a given day-of-month. */
function nextBillingDate(day: number): string {
  const now = new Date();
  const year = now.getFullYear();
  let month = now.getMonth();
  if (now.getDate() > day) month += 1;
  const d = new Date(Date.UTC(year, month, Math.min(day, 28)));
  return d.toISOString().slice(0, 10);
}

/** Creates or updates a client's membership (org admins only). Keeps the
 *  active-column WIP limit in sync with the chosen Stage. */
export async function upsertMembershipAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    ...Object.fromEntries(formData.entries()),
    custom_enabled: formData.get('custom_enabled') === 'on',
    auto_send: formData.get('auto_send') === 'on',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const d = parsed.data;

  let customCents: number | null = null;
  if (d.custom_enabled) {
    customCents = parseEuroToCents(d.custom_price || '');
    if (customCents == null) {
      return errorResult('Bitte einen gültigen individuellen Preis angeben.');
    }
  }

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: d.orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('client_memberships').upsert(
    {
      organization_id: d.orgId,
      client_company_id: d.clientCompanyId,
      stage: d.stage,
      custom_name: d.custom_enabled ? d.custom_name || null : null,
      custom_net_cents: customCents,
      interval_months: d.interval_months,
      billing_day: d.billing_day,
      payment_method: d.payment_method,
      status: d.status,
      start_date: d.start_date,
      next_invoice_date: nextBillingDate(d.billing_day),
      auto_send: d.auto_send,
      mandate_reference: d.mandate_reference || null,
      mandate_date: d.mandate_date || null,
      debtor_iban: d.debtor_iban || null,
      debtor_bic: d.debtor_bic || null,
      billing_name: d.billing_name || null,
      billing_address_line1: d.billing_address_line1 || null,
      billing_address_line2: d.billing_address_line2 || null,
      billing_postal_code: d.billing_postal_code || null,
      billing_city: d.billing_city || null,
      billing_country: d.billing_country || 'Deutschland',
      billing_vat_id: d.billing_vat_id || null,
    },
    { onConflict: 'client_company_id' },
  );
  if (error) return errorResult(de.errors.INTERNAL);

  // Keep the active-task WIP limit aligned with the Stage across the client's
  // projects (Stage 1 = 1 active task, Stage 2 = 2).
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('client_company_id', d.clientCompanyId)
    .is('deleted_at', null);
  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length > 0) {
    const { data: boards } = await supabase
      .from('boards')
      .select('id')
      .in('project_id', projectIds);
    const boardIds = (boards ?? []).map((b) => b.id);
    if (boardIds.length > 0) {
      await supabase
        .from('board_columns')
        .update({ wip_limit: d.stage, wip_limit_per_user: null })
        .in('board_id', boardIds)
        .eq('column_key', 'active');
    }
  }

  await logActivity({
    actorId: user.id,
    organizationId: d.orgId,
    action: 'update',
    entityType: 'client_membership',
    entityId: d.clientCompanyId,
    metadata: { stage: d.stage, custom: d.custom_enabled },
  });

  revalidatePath(`/app/clients/${d.clientCompanyId}`);
  return successResult('Mitgliedschaft gespeichert.');
}
