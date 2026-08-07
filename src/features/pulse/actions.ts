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
import { weekStartOf } from './week';

const schema = z.object({
  mood: z.coerce.number().int().min(1).max(3),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
});

/** Records/updates the current user's pulse for this week. */
export async function setPulseAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    mood: formData.get('mood'),
    comment: formData.get('comment') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('pulse_checks').upsert(
    {
      organization_id: orgId,
      user_id: user.id,
      week_start: weekStartOf(),
      mood: parsed.data.mood,
      comment: parsed.data.comment ? parsed.data.comment : null,
    },
    { onConflict: 'user_id,week_start' },
  );
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app');
  revalidatePath('/app/team-radar');
  return successResult('Danke für dein Feedback!');
}
