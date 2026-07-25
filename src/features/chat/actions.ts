'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const sendSchema = z.object({
  clientCompanyId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

/**
 * Posts an internal chat message about a client company. RLS restricts inserts
 * to agency staff of the organization; the message is never visible to clients.
 */
export async function sendClientChatMessageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = sendSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, body } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Resolve the org from the client company (RLS-scoped read).
  const { data: company } = await supabase
    .from('client_companies')
    .select('organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) return errorResult(de.errors.FORBIDDEN);

  const { error } = await supabase.from('client_chat_messages').insert({
    organization_id: company.organization_id,
    client_company_id: clientCompanyId,
    author_id: user.id,
    body,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Nachricht gesendet.');
}
