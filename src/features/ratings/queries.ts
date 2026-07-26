import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface TaskRatingSummary {
  average: number | null;
  count: number;
  myStars: number | null;
}

/** Rating summary for a task plus the current user's own rating. RLS-scoped. */
export async function getTaskRating(
  taskId: string,
  userId: string,
): Promise<TaskRatingSummary> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('task_ratings')
    .select('rater_user_id, stars')
    .eq('task_id', taskId);
  const rows = data ?? [];
  const count = rows.length;
  const average = count
    ? Math.round((rows.reduce((n, r) => n + r.stars, 0) / count) * 10) / 10
    : null;
  const mine = rows.find((r) => r.rater_user_id === userId);
  return { average, count, myStars: mine?.stars ?? null };
}
