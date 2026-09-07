'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
  idleResult,
} from '@/lib/action-result';
import { createDraftInvoiceAction } from '@/features/billing/invoice-actions';

/** Lädt die Mitgliedschaft (Org + Existenz) für die Autorisierung. */
async function loadMembershipOrg(
  clientCompanyId: string,
): Promise<{ orgId: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_memberships')
    .select('organization_id')
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  return data ? { orgId: data.organization_id } : null;
}

const statusSchema = z.object({
  clientCompanyId: z.string().uuid(),
  status: z.enum(['active', 'paused', 'canceled']),
});

/** Setzt den Status einer Mitgliedschaft (Aktiv/Pausiert/Gekündigt). */
export async function setMembershipStatusAction(
  input: z.infer<typeof statusSchema>,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, status } = parsed.data;

  const org = await loadMembershipOrg(clientCompanyId);
  if (!org) return errorResult(de.errors.NOT_FOUND);

  const user = await requireUser();
  authorize(user, { type: 'billing.manage', orgId: org.orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('client_memberships')
    .update({ status })
    .eq('client_company_id', clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: org.orgId,
    action: 'status_change',
    entityType: 'client_membership',
    entityId: clientCompanyId,
    metadata: { status },
  });

  revalidatePath('/app/memberships');
  const label = status === 'active' ? 'aktiviert' : status === 'paused' ? 'pausiert' : 'gekündigt';
  return successResult(`Mitgliedschaft ${label}.`);
}

const markSchema = z.object({
  clientCompanyId: z.string().uuid(),
  // Abrechnungsmonat als 'YYYY-MM'.
  period: z.string().regex(/^\d{4}-\d{2}$/),
  collected: z.boolean(),
});

/**
 * Hakt den Zahlungseingang eines Monats ab (z. B. SEPA-Lastschrift abgebucht)
 * bzw. entfernt die Markierung wieder.
 */
export async function setMembershipCollectedAction(
  input: z.infer<typeof markSchema>,
): Promise<ActionResult> {
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, period, collected } = parsed.data;

  const org = await loadMembershipOrg(clientCompanyId);
  if (!org) return errorResult(de.errors.NOT_FOUND);

  const user = await requireUser();
  authorize(user, { type: 'billing.manage', orgId: org.orgId });

  const supabase = await createSupabaseServerClient();
  if (collected) {
    const { error } = await supabase
      .from('membership_payment_marks')
      .upsert(
        {
          organization_id: org.orgId,
          client_company_id: clientCompanyId,
          period,
          collected_at: new Date().toISOString(),
          collected_by: user.id,
        },
        { onConflict: 'client_company_id,period' },
      );
    if (error) return errorResult(de.errors.INTERNAL);
  } else {
    const { error } = await supabase
      .from('membership_payment_marks')
      .delete()
      .eq('client_company_id', clientCompanyId)
      .eq('period', period);
    if (error) return errorResult(de.errors.INTERNAL);
  }

  revalidatePath('/app/memberships');
  return successResult(collected ? 'Als abgebucht markiert.' : 'Markierung entfernt.');
}

/** Erstellt einen Rechnungsentwurf für den Kunden (Wrapper der Rechnungs-Action). */
export async function generateDraftInvoiceAction(
  clientCompanyId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(clientCompanyId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const fd = new FormData();
  fd.set('clientCompanyId', clientCompanyId);
  const result = await createDraftInvoiceAction(idleResult, fd);
  revalidatePath('/app/memberships');
  return result;
}
