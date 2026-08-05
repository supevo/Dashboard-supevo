'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { hasClientAccess } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const schema = z.object({ enabled: z.enum(['true', 'false']) });

/**
 * Lets a client turn per-task notifications on/off for themselves. Writes their
 * own client_contacts rows (verified via an RLS read of the caller's contact),
 * so it never touches another person's preference.
 */
export async function setMyTaskNotifyPrefAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({ enabled: formData.get('enabled') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await getCurrentUser();
  if (!user || !hasClientAccess(user)) return errorResult(de.errors.FORBIDDEN);

  // RLS returns only the caller's own contact rows.
  const supabase = await createSupabaseServerClient();
  const { data: contacts } = await supabase
    .from('client_contacts')
    .select('id');
  const ids = (contacts ?? []).map((c) => c.id);
  if (ids.length === 0) return errorResult(de.errors.FORBIDDEN);

  const { error } = await createSupabaseServiceClient()
    .from('client_contacts')
    .update({ notify_task_updates: parsed.data.enabled === 'true' })
    .in('id', ids);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/portal/notifications');
  return successResult('Einstellung gespeichert.');
}
