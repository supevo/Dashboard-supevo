import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface RecurringTask {
  id: string;
  title: string;
  frequency: 'weekly' | 'monthly';
  weekday: number | null;
  dayOfMonth: number | null;
  isInternal: boolean;
  nextRunDate: string;
  active: boolean;
}

/** Lists a project's recurring task templates. RLS-scoped. */
export async function listRecurringTasks(
  projectId: string,
): Promise<RecurringTask[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('recurring_tasks')
    .select(
      'id, title, frequency, weekday, day_of_month, is_internal, next_run_date, active',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    frequency: r.frequency,
    weekday: r.weekday,
    dayOfMonth: r.day_of_month,
    isInternal: r.is_internal,
    nextRunDate: r.next_run_date,
    active: r.active,
  }));
}
