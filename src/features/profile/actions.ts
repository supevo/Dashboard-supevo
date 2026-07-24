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

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(120),
});

/** Updates the current user's own profile (display name). */
export async function updateProfileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get('fullName'),
  });
  if (!parsed.success) {
    return errorResult(
      parsed.error.flatten().fieldErrors.fullName?.[0] ?? de.errors.VALIDATION,
    );
  }

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName })
    .eq('id', user.id);

  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/profile');
  revalidatePath('/portal/profile');
  return successResult('Profil gespeichert.');
}
