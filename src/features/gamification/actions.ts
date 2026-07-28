'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/session';

/**
 * Increments a UI-action counter for the current user (for collectible badges).
 * Fire-and-forget: never throws, so a failed count can't break the action that
 * triggered it. Uses an atomic Postgres function so rapid clicks don't lose
 * increments (a read-then-write would).
 */
export async function bumpCounter(key: string): Promise<void> {
  const clean = key.trim().slice(0, 40);
  if (!clean) return;
  try {
    const user = await requireUser();
    const orgId = primaryAgencyOrgId(user);
    if (!orgId) return;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc('bump_counter', { p_key: clean, p_org: orgId });
    if (error) console.error('bumpCounter failed', error);
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
