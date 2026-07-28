import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** All of a user's UI-action counters as a key→count map. */
export async function getCounters(userId: string): Promise<Map<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('user_counters')
    .select('key, count')
    .eq('user_id', userId);
  return new Map((data ?? []).map((c) => [c.key, c.count] as const));
}
