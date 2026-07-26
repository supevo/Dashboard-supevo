'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const createSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().trim().min(1, 'Bitte einen Titel angeben.').max(200),
  description: z.string().max(2000).optional().or(z.literal('')),
  period: z.string().max(40).optional().or(z.literal('')),
});

/** Creates an objective for a user (self, or anyone if org admin via RLS). */
export async function createObjectiveAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    userId: formData.get('userId'),
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    period: formData.get('period') ?? '',
  });
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const d = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('objectives').insert({
    organization_id: orgId,
    user_id: d.userId,
    title: d.title,
    description: d.description || null,
    period: d.period || null,
    created_by: user.id,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/goals');
  return successResult('Ziel angelegt.');
}

/** Adds a key result / milestone to an objective. */
export async function addKeyResultAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      objectiveId: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
    })
    .safeParse({
      objectiveId: formData.get('objectiveId'),
      title: formData.get('title'),
    });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('key_results').insert({
    objective_id: parsed.data.objectiveId,
    title: parsed.data.title,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/goals');
  return successResult('Etappe hinzugefügt.');
}

/** Toggles a key result done/undone. */
export async function toggleKeyResultAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      done: z.enum(['true', 'false']),
    })
    .safeParse({ id: formData.get('id'), done: formData.get('done') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('key_results')
    .update({ done: parsed.data.done === 'true' })
    .eq('id', parsed.data.id);
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/goals');
  return successResult('Aktualisiert.');
}

/** Deletes a key result. */
export async function deleteKeyResultAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return errorResult(de.errors.VALIDATION);
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('key_results').delete().eq('id', id.data);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/goals');
  return successResult('Entfernt.');
}

/** Sets an objective's status (active/done/archived) or deletes it. */
export async function setObjectiveStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      status: z.enum(['active', 'done', 'archived']),
    })
    .safeParse({ id: formData.get('id'), status: formData.get('status') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('objectives')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/goals');
  return successResult('Aktualisiert.');
}

export async function deleteObjectiveAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return errorResult(de.errors.VALIDATION);
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('objectives').delete().eq('id', id.data);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/goals');
  return successResult('Ziel gelöscht.');
}
