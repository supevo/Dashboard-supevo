import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export interface ClientRecurringTask {
  id: string;
  title: string;
  scheduleLabel: string;
}

/** Builds a human-readable schedule label ("wöchentlich montags" / "monatlich am 15."). */
function scheduleLabel(r: {
  frequency: string;
  weekday: number | null;
  day_of_month: number | null;
}): string {
  if (r.frequency === 'weekly') {
    const day = r.weekday != null ? WEEKDAYS[r.weekday] : null;
    return day ? `wöchentlich · ${day}` : 'wöchentlich';
  }
  if (r.frequency === 'monthly') {
    return r.day_of_month != null ? `monatlich · am ${r.day_of_month}.` : 'monatlich';
  }
  return r.frequency;
}

/**
 * Client-facing list of a project's recurring tasks (non-internal, active only).
 * Read via the service client – the caller (portal project page) has already
 * verified the client's access to the project by loading it under RLS.
 */
export async function listClientRecurringTasks(
  projectId: string,
): Promise<ClientRecurringTask[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('recurring_tasks')
    .select('id, title, frequency, weekday, day_of_month, is_internal, active')
    .eq('project_id', projectId)
    .eq('is_internal', false)
    .eq('active', true)
    .order('created_at', { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    scheduleLabel: scheduleLabel(r),
  }));
}

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
