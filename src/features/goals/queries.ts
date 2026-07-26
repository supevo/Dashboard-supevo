import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface KeyResult {
  id: string;
  title: string;
  done: boolean;
  points: number;
}

export interface Objective {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  period: string | null;
  status: 'active' | 'done' | 'archived';
  keyResults: KeyResult[];
  progress: number; // 0..100
}

/** Objectives (with key results + progress) for a specific user. RLS-scoped. */
export async function listObjectivesForUser(
  userId: string,
): Promise<Objective[]> {
  const supabase = await createSupabaseServerClient();
  const { data: objectives } = await supabase
    .from('objectives')
    .select('id, user_id, title, description, period, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (!objectives || objectives.length === 0) return [];

  const ids = objectives.map((o) => o.id);
  const { data: krs } = await supabase
    .from('key_results')
    .select('id, objective_id, title, done, points')
    .in('objective_id', ids)
    .order('position', { ascending: true });
  const byObjective = new Map<string, KeyResult[]>();
  for (const k of krs ?? []) {
    const list = byObjective.get(k.objective_id) ?? [];
    list.push({ id: k.id, title: k.title, done: k.done, points: k.points });
    byObjective.set(k.objective_id, list);
  }

  return objectives.map((o) => {
    const keyResults = byObjective.get(o.id) ?? [];
    const doneCount = keyResults.filter((k) => k.done).length;
    const progress = keyResults.length
      ? Math.round((doneCount / keyResults.length) * 100)
      : o.status === 'done'
        ? 100
        : 0;
    return {
      id: o.id,
      userId: o.user_id,
      title: o.title,
      description: o.description,
      period: o.period,
      status: o.status,
      keyResults,
      progress,
    };
  });
}

/** Points earned from completed key results (for the gamification score). */
export async function getGoalPoints(userId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data: objectives } = await supabase
    .from('objectives')
    .select('id')
    .eq('user_id', userId);
  const ids = (objectives ?? []).map((o) => o.id);
  if (ids.length === 0) return 0;
  const { data: krs } = await supabase
    .from('key_results')
    .select('points, done')
    .in('objective_id', ids)
    .eq('done', true);
  return (krs ?? []).reduce((n, k) => n + k.points, 0);
}
