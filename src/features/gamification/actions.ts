'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';

/** Sets the current user's presence status (online / afk / dnd). */
export async function setUserStatusAction(status: string): Promise<void> {
  const parsed = z.enum(['online', 'afk', 'dnd']).safeParse(status);
  if (!parsed.success) return;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from('profiles').update({ status: parsed.data }).eq('id', user.id);

  revalidatePath('/app');
}
