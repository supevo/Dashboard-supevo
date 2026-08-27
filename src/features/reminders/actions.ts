'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const createSchema = z.object({
  text: z.string().trim().min(1).max(500),
  // ISO date or datetime; empty = kein Termin (reines To-do).
  dueAt: z.string().trim().max(40).optional().or(z.literal('')),
});

/** Creates a personal reminder/to-do for the current user. */
export async function createReminderAction(input: {
  text: string;
  dueAt?: string;
}): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return errorResult('Bitte einen Text angeben.');
  const user = await requireUser();

  let dueAt: string | null = null;
  if (parsed.data.dueAt) {
    const d = new Date(parsed.data.dueAt);
    if (Number.isNaN(d.getTime())) return errorResult('Ungültiges Datum.');
    dueAt = d.toISOString();
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('personal_reminders').insert({
    user_id: user.id,
    organization_id: primaryAgencyOrgId(user) ?? null,
    text: parsed.data.text,
    due_at: dueAt,
  });
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app');
  return successResult('Erinnerung angelegt.');
}

const idSchema = z.string().uuid();

/** Marks a reminder done (or reopens it). */
export async function setReminderDoneAction(
  reminderId: string,
  done: boolean,
): Promise<ActionResult> {
  if (!idSchema.safeParse(reminderId).success) return errorResult(de.errors.VALIDATION);
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('personal_reminders')
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq('id', reminderId);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app');
  return successResult();
}

/** Deletes a reminder. */
export async function deleteReminderAction(
  reminderId: string,
): Promise<ActionResult> {
  if (!idSchema.safeParse(reminderId).success) return errorResult(de.errors.VALIDATION);
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('personal_reminders')
    .delete()
    .eq('id', reminderId);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app');
  return successResult();
}
