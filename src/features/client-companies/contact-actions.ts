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
} from '@/lib/action-result';

const removeContactSchema = z.object({
  orgId: z.string().uuid(),
  contactId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
});

/** Removes a contact assignment from a client company. */
export async function removeClientContactAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = removeContactSchema.safeParse({
    orgId: formData.get('orgId'),
    contactId: formData.get('contactId'),
    clientCompanyId: formData.get('clientCompanyId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { orgId, contactId, clientCompanyId } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'clientContact.manage', orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('client_contacts')
    .delete()
    .eq('id', contactId)
    .eq('organization_id', orgId);

  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'delete',
    entityType: 'client_contact',
    entityId: contactId,
  });

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Ansprechpartner entfernt.');
}
