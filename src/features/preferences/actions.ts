'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/session';
import { logger } from '@/lib/logger';

/**
 * Sets the current user's preference for a kind of work (1–10 hearts). Level 0
 * removes it. Upsert keyed by (user_id, name). RLS lets a user manage only
 * their own preferences. Throws on a DB error so the caller can revert its
 * optimistic UI instead of silently losing the change.
 */
export async function setPreferenceLevel(
  name: string,
  level: number,
): Promise<void> {
  const cleanName = name.trim().slice(0, 60);
  if (!cleanName) return;
  const lvl = Math.max(0, Math.min(10, Math.round(level)));

  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return;

  const supabase = await createSupabaseServerClient();
  const { error } =
    lvl <= 0
      ? await supabase
          .from('work_preferences')
          .delete()
          .eq('user_id', user.id)
          .eq('name', cleanName)
      : await supabase.from('work_preferences').upsert(
          {
            user_id: user.id,
            organization_id: orgId,
            name: cleanName,
            level: lvl,
          },
          { onConflict: 'user_id,name' },
        );

  if (error) {
    logger.error('setPreferenceLevel failed', { error });
    throw new Error(error.message);
  }

  revalidatePath('/app/profile');
}
