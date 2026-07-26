import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Actual logged minutes for a task, summed from time entries. RLS-scoped. */
export async function getTaskActualMinutes(taskId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('time_entries')
    .select('duration_minutes')
    .eq('task_id', taskId);
  return (data ?? []).reduce((n, e) => n + (e.duration_minutes ?? 0), 0);
}
