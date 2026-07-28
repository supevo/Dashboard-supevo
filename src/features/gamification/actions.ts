'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/session';

/**
 * Increments a UI-action counter for the current user (for collectible badges).
 * Fire-and-forget: never throws, so a failed count can't break the action that
 * triggered it. Non-atomic read-then-write is fine at badge granularity.
 */
export async function bumpCounter(key: string): Promise<void> {
  const clean = key.trim().slice(0, 40);
  if (!clean) return;
  try {
    const user = await requireUser();
    const orgId = primaryAgencyOrgId(user);
    if (!orgId) return;
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('user_counters')
      .select('count')
      .eq('user_id', user.id)
      .eq('key', clean)
      .maybeSingle();
    await supabase.from('user_counters').upsert(
      {
        user_id: user.id,
        organization_id: orgId,
        key: clean,
        count: (data?.count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,key' },
    );
  } catch (err) {
    console.error('bumpCounter failed', err);
  }
}

/** Sets the current user's presence status (online / afk / dnd). */
export async function setUserStatusAction(status: string): Promise<void> {
  const parsed = z.enum(['online', 'afk', 'dnd']).safeParse(status);
  if (!parsed.success) return;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from('profiles').update({ status: parsed.data }).eq('id', user.id);

  // Collectible badge: count each time the user goes "Do not disturb".
  if (parsed.data === 'dnd') await bumpCounter('dnd');

  revalidatePath('/app');
}
