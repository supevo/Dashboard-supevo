'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { updateOrganizationSchema } from './schema';

export async function updateOrganizationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateOrganizationSchema.safeParse({
    orgId: formData.get('orgId'),
    name: formData.get('name'),
  });
  if (!parsed.success) {
    return errorResult(
      de.errors.VALIDATION,
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { orgId, name } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('organizations')
    .update({ name })
    .eq('id', orgId);

  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'update',
    entityType: 'organization',
    entityId: orgId,
    metadata: { name },
  });

  revalidatePath('/app/settings');
  return successResult('Organisation aktualisiert.');
}
