'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/session';

/**
 * Sets the current user's preference for a kind of work (1–5 hearts). Level 0
 * removes it. Upsert keyed by (user_id, name). RLS lets a user manage only
 * their own preferences.
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
  if (lvl <= 0) {
    await supabase
      .from('work_preferences')
      .delete()
      .eq('user_id', user.id)
      .eq('name', cleanName);
  } else {
    await supabase.from('work_preferences').upsert(
      {
        user_id: user.id,
        organization_id: orgId,
        name: cleanName,
        level: lvl,
      },
      { onConflict: 'user_id,name' },
    );
  }

  revalidatePath('/app/profile');
}
