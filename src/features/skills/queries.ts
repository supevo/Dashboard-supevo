import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface Skill {
  id: string;
  name: string;
  level: number;
}

/** Lists the current user's skills (highest level first). RLS-scoped. */
export async function listMySkills(userId: string): Promise<Skill[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('employee_skills')
    .select('id, name, level')
    .eq('user_id', userId)
    .order('level', { ascending: false })
    .order('name', { ascending: true });
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, level: s.level }));
}
