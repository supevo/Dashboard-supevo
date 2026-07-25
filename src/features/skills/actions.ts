'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/session';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const addSchema = z.object({
  name: z.string().trim().min(2, 'Bitte gib einen Namen ein.').max(60),
  level: z.coerce.number().int().min(0).max(10),
});

/** Adds (or updates the level of) a skill for the current user. */
export async function addSkillAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = addSchema.safeParse({
    name: formData.get('name'),
    level: formData.get('level') ?? '5',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('employee_skills').upsert(
    {
      user_id: user.id,
      organization_id: orgId,
      name: parsed.data.name,
      level: parsed.data.level,
    },
    { onConflict: 'user_id,name' },
  );
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/profile');
  return successResult('Skill gespeichert.');
}

const updateSchema = z.object({
  skillId: z.string().uuid(),
  level: z.coerce.number().int().min(0).max(10),
});

/** Updates the proficiency level of one of the user's skills. */
export async function updateSkillLevelAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse({
    skillId: formData.get('skillId'),
    level: formData.get('level'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('employee_skills')
    .update({ level: parsed.data.level }, { count: 'exact' })
    .eq('id', parsed.data.skillId);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/profile');
  return successResult('Skill aktualisiert.');
}

const removeSchema = z.object({ skillId: z.string().uuid() });

/** Removes one of the user's skills. */
export async function removeSkillAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = removeSchema.safeParse({ skillId: formData.get('skillId') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('employee_skills')
    .delete()
    .eq('id', parsed.data.skillId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/profile');
  return successResult('Skill entfernt.');
}
