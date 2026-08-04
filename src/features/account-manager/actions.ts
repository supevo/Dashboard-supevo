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

const schema = z.object({
  clientCompanyId: z.string().uuid(),
  managerId: z.string().uuid().optional().or(z.literal('')),
});

/**
 * Sets (or clears) the responsible account manager for a client company.
 * Admin-only: authorized in-code, then written with the service client (the
 * agency-scoped RLS on client_companies excludes super_admin from some paths).
 */
export async function setAccountManagerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    managerId: formData.get('managerId') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, managerId } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);

  // Access gate: read the company with the caller's RLS client, then verify admin.
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
    .update({ account_manager_id: managerId ? managerId : null })
    .eq('id', clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Ansprechpartner gespeichert.');
}
