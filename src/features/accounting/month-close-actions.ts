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

/**
 * Marks a booking as intentionally without a receipt (or reverts it). Beim
 * Markieren ist ein Grund PFLICHT – er landet im Steuerberater-Export. Beim
 * Zurücknehmen wird der Grund wieder geleert.
 */
export async function setBelegNichtNoetigAction(input: {
  transactionId: string;
  value: boolean;
  reason?: string;
}): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(input.transactionId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const reason = (input.reason ?? '').trim().slice(0, 500);
  if (input.value && reason.length < 2) {
    return errorResult('Bitte einen Grund angeben (für den Steuerberater).');
  }

  const supabase = await createSupabaseServerClient();
  const { data: tx } = await supabase
    .from('bookkeeping_transactions')
    .select('organization_id')
    .eq('id', input.transactionId)
    .maybeSingle();
  if (!tx) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: tx.organization_id });

  const { error } = await supabase
    .from('bookkeeping_transactions')
    .update({
      beleg_nicht_noetig: input.value,
      beleg_nicht_noetig_grund: input.value ? reason : null,
    } as never)
    .eq('id', input.transactionId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/finance');
  return successResult(
    input.value ? 'Als „kein Beleg nötig“ markiert.' : 'Markierung entfernt.',
  );
}
