import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { minutesBetween, startOfBerlinDayUtc } from '@/lib/time';

export interface WorkStatus {
  openSessionId: string | null;
  onBreak: boolean;
  todayMinutes: number;
}

/** Current work-time status for the user and today's net worked minutes. */
export async function getWorkStatus(userId: string): Promise<WorkStatus> {
  const supabase = await createSupabaseServerClient();
  const dayStart = startOfBerlinDayUtc();

  const { data: sessions } = await supabase
    .from('work_sessions')
    .select('id, clock_in, clock_out')
    .eq('user_id', userId)
    .gte('clock_in', dayStart)
    .order('clock_in', { ascending: true });

  const open = (sessions ?? []).find((s) => s.clock_out === null) ?? null;

  let onBreak = false;
  if (open) {
    const { data: openBreak } = await supabase
      .from('work_session_breaks')
      .select('id')
      .eq('work_session_id', open.id)
      .is('break_end', null)
      .maybeSingle();
    onBreak = !!openBreak;
  }

  // Net minutes = session spans minus break spans (today).
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const breaksBySession = new Map<string, number>();
  if (sessionIds.length > 0) {
    const { data: breaks } = await supabase
      .from('work_session_breaks')
      .select('work_session_id, break_start, break_end')
      .in('work_session_id', sessionIds);
    for (const b of breaks ?? []) {
      const end = b.break_end ?? new Date().toISOString();
      const mins = minutesBetween(b.break_start, end);
      breaksBySession.set(
        b.work_session_id,
        (breaksBySession.get(b.work_session_id) ?? 0) + mins,
      );
    }
  }

  let todayMinutes = 0;
  for (const s of sessions ?? []) {
    const end = s.clock_out ?? new Date().toISOString();
    todayMinutes += minutesBetween(s.clock_in, end);
    todayMinutes -= breaksBySession.get(s.id) ?? 0;
  }

  return {
    openSessionId: open ? open.id : null,
    onBreak,
    todayMinutes: Math.max(0, todayMinutes),
  };
}

export interface RunningTimer {
  id: string;
  taskId: string | null;
  projectId: string;
  startedAt: string;
  label: string;
}

/** The user's currently running task timer, if any. */
export async function getRunningTimer(
  userId: string,
): Promise<RunningTimer | null> {
  const supabase = await createSupabaseServerClient();
  const { data: entry } = await supabase
    .from('time_entries')
    .select('id, task_id, project_id, started_at')
    .eq('user_id', userId)
    .eq('source', 'timer')
    .is('ended_at', null)
    .maybeSingle();
  if (!entry) return null;

  let label = 'Projekt';
  if (entry.task_id) {
    const { data: task } = await supabase
      .from('tasks')
      .select('title')
      .eq('id', entry.task_id)
      .maybeSingle();
    label = task?.title ?? label;
  }
  return {
    id: entry.id,
    taskId: entry.task_id,
    projectId: entry.project_id,
    startedAt: entry.started_at,
    label,
  };
}

export interface TimeEntryView {
  id: string;
  projectId: string;
  taskId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  description: string | null;
  isBillable: boolean;
  source: 'manual' | 'timer';
}

export interface TimeSummary {
  entries: TimeEntryView[];
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
}

/** The user's completed time entries since `sinceIso`, with totals. */
export async function getMyTimeSummary(
  userId: string,
  sinceIso: string,
): Promise<TimeSummary> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('time_entries')
    .select(
      'id, project_id, task_id, started_at, ended_at, duration_minutes, description, is_billable, source',
    )
    .eq('user_id', userId)
    .gte('started_at', sinceIso)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false });

  const entries: TimeEntryView[] = (data ?? []).map((e) => ({
    id: e.id,
    projectId: e.project_id,
    taskId: e.task_id,
    startedAt: e.started_at,
    endedAt: e.ended_at,
    durationMinutes: e.duration_minutes,
    description: e.description,
    isBillable: e.is_billable,
    source: e.source,
  }));

  let billable = 0;
  let nonBillable = 0;
  for (const e of entries) {
    const m = e.durationMinutes ?? 0;
    if (e.isBillable) billable += m;
    else nonBillable += m;
  }

  return {
    entries,
    totalMinutes: billable + nonBillable,
    billableMinutes: billable,
    nonBillableMinutes: nonBillable,
  };
}
