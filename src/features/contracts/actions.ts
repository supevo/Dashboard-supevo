'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

/** Speichert den (org-weiten) Vertragskonditionstext. Nur Org-Admins. */
export async function updateContractTermsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const orgId = String(formData.get('orgId') ?? '');
  if (!z.string().uuid().safeParse(orgId).success) return errorResult(de.errors.VALIDATION);
  const terms = String(formData.get('terms') ?? '').slice(0, 40000);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('contract_settings')
    .upsert({ organization_id: orgId, terms }, { onConflict: 'organization_id' });
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/vertrag');
  return successResult('Vertragstext gespeichert.');
}
