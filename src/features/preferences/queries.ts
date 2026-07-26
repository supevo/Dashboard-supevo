import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface WorkPreference {
  id: string;
  name: string;
  level: number; // 1..5
}

/** Lists the current user's work preferences (most-liked first). RLS-scoped. */
export async function listMyPreferences(
  userId: string,
): Promise<WorkPreference[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('work_preferences')
    .select('id, name, level')
    .eq('user_id', userId)
    .order('level', { ascending: false })
    .order('name', { ascending: true });
  return (data ?? []).map((p) => ({ id: p.id, name: p.name, level: p.level }));
}
