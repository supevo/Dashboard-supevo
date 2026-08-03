import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  minutesBetween,
  startOfBerlinDayUtc,
  startOfBerlinWeekUtc,
  berlinWeekday,
} from '@/lib/time';

/** Default weekly target when no explicit one is set for the member. */
export const DEFAULT_WEEKLY_TARGET_HOURS = 40;

export interface WeeklyWorkSummary {
  weekMinutes: number;
  todayMinutes: number;
  targetHours: number;
  /** Pro-rated expected minutes up to and including today. */
  expectedMinutes: number;
  /** on = im Rahmen, low = zu wenig, over = über Plan. */
  status: 'on' | 'low' | 'over';
}

/**
 * This week's net worked minutes (Mon–Sun, Berlin) vs. the member's weekly
 * target, with a fair pro-rated status: the expectation grows with the number
 * of elapsed weekdays (Mon–Fri incl. today), so early in the week you are not
 * flagged "too little" just because the week just started.
 */
export async function getWeeklyWorkSummary(
  userId: string,
  orgId: string,
): Promise<WeeklyWorkSummary> {
  const supabase = await createSupabaseServerClient();
  const weekStart = startOfBerlinWeekUtc();
  const dayStart = startOfBerlinDayUtc();

  const { data: sessions } = await supabase
    .from('work_sessions')
    .select('id, clock_in, clock_out')
    .eq('user_id', userId)
    .gte('clock_in', weekStart)
    .order('clock_in', { ascending: true });

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const breaksBySession = new Map<string, number>();
  if (sessionIds.length > 0) {
    const { data: breaks } = await supabase
      .from('work_session_breaks')
      .select('work_session_id, break_start, break_end')
      .in('work_session_id', sessionIds);
    for (const b of breaks ?? []) {
      const end = b.break_end ?? new Date().toISOString();
      breaksBySession.set(
        b.work_session_id,
        (breaksBySession.get(b.work_session_id) ?? 0) + minutesBetween(b.break_start, end),
      );
    }
  }

  let weekMinutes = 0;
  let todayMinutes = 0;
  for (const s of sessions ?? []) {
    const end = s.clock_out ?? new Date().toISOString();
    const net = minutesBetween(s.clock_in, end) - (breaksBySession.get(s.id) ?? 0);
    weekMinutes += net;
    if (s.clock_in >= dayStart) todayMinutes += net;
  }
  weekMinutes = Math.max(0, weekMinutes);
  todayMinutes = Math.max(0, todayMinutes);

  // Member's weekly target (service client: reading another member's row is not
  // needed here – it's the current user – but keep it robust across contexts).
  const service = createSupabaseServiceClient();
  const { data: membership } = await service
    .from('memberships')
    .select('weekly_target_hours')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  const targetHours = membership?.weekly_target_hours ?? DEFAULT_WEEKLY_TARGET_HOURS;
  const targetMinutes = targetHours * 60;

  // Elapsed workdays Mon–Fri including today (Sat/Sun count as the full 5).
  const elapsedWorkdays = Math.min(5, berlinWeekday());
  const expectedMinutes = Math.round((targetMinutes * elapsedWorkdays) / 5);

  const ratio = expectedMinutes > 0 ? weekMinutes / expectedMinutes : 1;
  const status: WeeklyWorkSummary['status'] =
    ratio >= 1.1 ? 'over' : ratio >= 0.9 ? 'on' : 'low';

  return { weekMinutes, todayMinutes, targetHours, expectedMinutes, status };
}

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
