'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const toggleSchema = z.object({
  clientCompanyId: z.string().uuid(),
  billPrint: z.enum(['true', 'false']),
});

/**
 * Turns print-product billing on/off for a client. Admin-only: authorized in
 * code after an RLS read of the company, then written with the service client.
 */
export async function setPrintBillingAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = toggleSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    billPrint: formData.get('billPrint'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, billPrint } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);

  const rls = await createSupabaseServerClient();
  const { data: company } = await rls
    .from('client_companies')
    .select('id, organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) return errorResult(de.errors.NOT_FOUND);
  if (!isOrgAdmin(user, company.organization_id)) {
    return errorResult(de.errors.FORBIDDEN);
  }

  const { error } = await createSupabaseServiceClient()
    .from('client_companies')
    .update({ bill_print_products: billPrint === 'true' })
    .eq('id', clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Drucksachen-Einstellung gespeichert.');
}

/** Deletes a recorded print expense (admin-only; RLS also enforces this). */
export async function deletePrintExpenseAction(
  expenseId: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('print_expenses')
    .delete()
    .eq('id', expenseId);
  if (error) return { ok: false };
  revalidatePath('/app/expenses');
  return { ok: true };
}
