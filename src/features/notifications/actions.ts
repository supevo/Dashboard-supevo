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

const idSchema = z.object({ notificationId: z.string().uuid() });

export async function markNotificationReadAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({
    notificationId: formData.get('notificationId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', parsed.data.notificationId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/notifications');
  revalidatePath('/portal/notifications');
  return successResult();
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_id', user.id)
    .eq('is_read', false);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/notifications');
  revalidatePath('/portal/notifications');
  return successResult('Alle als gelesen markiert.');
}

export async function deleteNotificationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({
    notificationId: formData.get('notificationId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', parsed.data.notificationId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/notifications');
  revalidatePath('/portal/notifications');
  return successResult();
}
