import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { isAgencyRole, type AppRole } from '@/lib/authz/roles';
import { startOfBerlinDayUtc, startOfBerlinWeekUtc } from '@/lib/time';

export type PerfTrend = 'up' | 'down' | 'flat';

export interface MemberActivity {
  userId: string;
  fullName: string | null;
  hasAvatar: boolean;
  role: AppRole;
  // Live
  clockedIn: boolean;
  onBreak: boolean;
  currentTask: string | null;
  activeTaskCount: number;
  // This week
  weekDoneCount: number;
  weekDoneTitles: string[];
  // Selected day
  dayDoneCount: number;
  dayDoneTitles: string[];
  dayMinutes: number;
  dayStatusChanges: number;
  // Performance (30 days)
  done30: number;
  ontimePct: number | null;
  efficientPct: number | null;
  avgStars: number | null;
  rework: number;
  trend: PerfTrend;
}

export interface TeamActivity {
  day: string; // YYYY-MM-DD (Berlin)
  members: MemberActivity[];
}

function dayBoundsUtc(dayIso: string): { start: string; end: string } {
  const noon = new Date(`${dayIso}T12:00:00Z`);
  const start = startOfBerlinDayUtc(noon);
  const end = new Date(new Date(start).getTime() + 24 * 3_600_000).toISOString();
  return { start, end };
}

/**
 * Team-activity overview (admin): who is working on what right now, what each
 * person completed this week, a per-day timeline (retrospective) and a compact
 * performance signal over the last 30 days. Agency staff only; service client
 * after an in-code agency check (org-wide read of colleagues' work).
 */
export async function getTeamActivity(
  orgId: string,
  dayIso: string,
): Promise<TeamActivity> {
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { day: dayIso, members: [] };

  const service = createSupabaseServiceClient();
  const now = Date.now();
  const weekStart = startOfBerlinWeekUtc();
  const monthAgo = new Date(now - 30 * 86_400_000).toISOString();
  const lastWeekStart = new Date(new Date(weekStart).getTime() - 7 * 86_400_000).toISOString();
  const { start: dayStart, end: dayEnd } = dayBoundsUtc(dayIso);

  const { data: memberships } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  const staff = (memberships ?? []).filter((m) => isAgencyRole(m.role));
  if (staff.length === 0) return { day: dayIso, members: [] };
  const roleByUser = new Map(staff.map((m) => [m.user_id, m.role] as const));
  const userIds = [...roleByUser.keys()];

  const [
    { data: profiles },
    { data: columns },
    { data: openSessions },
    { data: runningTimers },
    { data: assignees },
    { data: doneRows },
    { data: xpRows },
    { data: dayTime },
    { data: dayStatus },
  ] = await Promise.all([
    service.from('profiles').select('id, full_name, avatar_url').in('id', userIds),
    service.from('board_columns').select('id, column_key').eq('organization_id', orgId),
    service.from('work_sessions').select('id, user_id').in('user_id', userIds).is('clock_out', null),
    service
      .from('time_entries')
      .select('user_id, task_id')
      .in('user_id', userIds)
      .is('ended_at', null),
    service.from('task_assignees').select('task_id, user_id').in('user_id', userIds),
    // Completed tasks in the last 30 days (covers day/week/trend/rework).
    service
      .from('tasks')
      .select('id, title, completed_by, completed_at, reopen_count')
      .eq('organization_id', orgId)
      .not('completed_by', 'is', null)
      .gte('completed_at', monthAgo)
      .limit(5000),
    service
      .from('xp_events')
      .select('user_id, kind, created_at')
      .in('user_id', userIds)
      .in('kind', ['ontime', 'efficient'])
      .gte('created_at', monthAgo),
    service
      .from('time_entries')
      .select('user_id, duration_minutes')
      .in('user_id', userIds)
      .gte('started_at', dayStart)
      .lt('started_at', dayEnd)
      .not('ended_at', 'is', null),
    service
      .from('activity_log')
      .select('actor_id')
      .eq('action', 'status_change')
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd)
      .in('actor_id', userIds),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p] as const));
  const keyByColumn = new Map((columns ?? []).map((c) => [c.id, c.column_key] as const));

  // Clock / break status.
  const sessionIds = (openSessions ?? []).map((s) => s.id);
  const clockedIn = new Set((openSessions ?? []).map((s) => s.user_id));
  const openByUser = new Map((openSessions ?? []).map((s) => [s.id, s.user_id] as const));
  const onBreak = new Set<string>();
  if (sessionIds.length > 0) {
    const { data: breaks } = await service
      .from('work_session_breaks')
      .select('work_session_id')
      .in('work_session_id', sessionIds)
      .is('break_end', null);
    for (const b of breaks ?? []) {
      const uid = openByUser.get(b.work_session_id);
      if (uid) onBreak.add(uid);
    }
  }

  // Active tasks (assigned + in the 'active' column) and their titles.
  const taskIdsForTitles = new Set<string>();
  for (const t of runningTimers ?? []) if (t.task_id) taskIdsForTitles.add(t.task_id);
  const activeAssignments = new Map<string, { count: number; firstTaskId: string | null }>();
  // Need task column + title for assignees; fetch the assigned tasks.
  const assignedTaskIds = [...new Set((assignees ?? []).map((a) => a.task_id))];
  const taskInfo = new Map<string, { title: string; columnKey: string | undefined }>();
  if (assignedTaskIds.length > 0) {
    const { data: assignedTasks } = await service
      .from('tasks')
      .select('id, title, column_id')
      .in('id', assignedTaskIds)
      .eq('is_archived', false)
      .is('deleted_at', null);
    for (const t of assignedTasks ?? []) {
      taskInfo.set(t.id, { title: t.title, columnKey: keyByColumn.get(t.column_id) });
    }
  }
  for (const a of assignees ?? []) {
    const info = taskInfo.get(a.task_id);
    if (!info || info.columnKey !== 'active') continue;
    const cur = activeAssignments.get(a.user_id) ?? { count: 0, firstTaskId: null };
    cur.count++;
    if (!cur.firstTaskId) cur.firstTaskId = a.task_id;
    activeAssignments.set(a.user_id, cur);
  }

  // Titles for running-timer tasks.
  const runningTaskByUser = new Map<string, string>();
  const runningTaskIds = [...taskIdsForTitles];
  if (runningTaskIds.length > 0) {
    const { data: rt } = await service.from('tasks').select('id, title').in('id', runningTaskIds);
    const titleById = new Map((rt ?? []).map((t) => [t.id, t.title] as const));
    for (const t of runningTimers ?? []) {
      if (t.task_id && titleById.has(t.task_id)) {
        runningTaskByUser.set(t.user_id, titleById.get(t.task_id)!);
      }
    }
  }

  // Completed-task aggregation (day / week / 30d / trend / rework).
  interface Agg {
    dayTitles: string[];
    weekTitles: string[];
    done30: number;
    rework: number;
    thisWeek: number;
    lastWeek: number;
  }
  const agg = new Map<string, Agg>();
  for (const id of userIds) {
    agg.set(id, { dayTitles: [], weekTitles: [], done30: 0, rework: 0, thisWeek: 0, lastWeek: 0 });
  }
  for (const t of doneRows ?? []) {
    const uid = t.completed_by as string | null;
    if (!uid) continue;
    const a = agg.get(uid);
    if (!a || !t.completed_at) continue;
    a.done30++;
    a.rework += t.reopen_count ?? 0;
    if (t.completed_at >= weekStart) {
      a.thisWeek++;
      if (a.weekTitles.length < 8) a.weekTitles.push(t.title);
    } else if (t.completed_at >= lastWeekStart) {
      a.lastWeek++;
    }
    if (t.completed_at >= dayStart && t.completed_at < dayEnd) {
      if (a.dayTitles.length < 8) a.dayTitles.push(t.title);
    }
  }
  // Day completed counts (separate from titles cap).
  const dayDoneCount = new Map<string, number>();
  for (const t of doneRows ?? []) {
    const uid = t.completed_by as string | null;
    if (!uid || !t.completed_at) continue;
    if (t.completed_at >= dayStart && t.completed_at < dayEnd) {
      dayDoneCount.set(uid, (dayDoneCount.get(uid) ?? 0) + 1);
    }
  }

  // XP-based on-time / efficient counts (30d).
  const ontimeByUser = new Map<string, number>();
  const efficientByUser = new Map<string, number>();
  for (const x of xpRows ?? []) {
    if (x.kind === 'ontime') ontimeByUser.set(x.user_id, (ontimeByUser.get(x.user_id) ?? 0) + 1);
    if (x.kind === 'efficient') efficientByUser.set(x.user_id, (efficientByUser.get(x.user_id) ?? 0) + 1);
  }

  // Average internal quality stars over the 30-day completed tasks.
  const completerByTask = new Map<string, string>();
  for (const t of doneRows ?? []) if (t.completed_by) completerByTask.set(t.id, t.completed_by);
  const starAgg = new Map<string, { sum: number; n: number }>();
  const done30TaskIds = [...completerByTask.keys()];
  if (done30TaskIds.length > 0) {
    const { data: ratings } = await service
      .from('task_ratings')
      .select('task_id, stars')
      .in('task_id', done30TaskIds);
    for (const r of ratings ?? []) {
      const uid = completerByTask.get(r.task_id);
      if (!uid) continue;
      const s = starAgg.get(uid) ?? { sum: 0, n: 0 };
      s.sum += r.stars;
      s.n++;
      starAgg.set(uid, s);
    }
  }

  // Day time + status changes.
  const dayMinutesByUser = new Map<string, number>();
  for (const r of dayTime ?? []) {
    dayMinutesByUser.set(r.user_id, (dayMinutesByUser.get(r.user_id) ?? 0) + (r.duration_minutes ?? 0));
  }
  const dayStatusByUser = new Map<string, number>();
  for (const r of dayStatus ?? []) {
    if (r.actor_id) dayStatusByUser.set(r.actor_id, (dayStatusByUser.get(r.actor_id) ?? 0) + 1);
  }

  const members: MemberActivity[] = userIds.map((id) => {
    const p = profileById.get(id);
    const a = agg.get(id)!;
    const active = activeAssignments.get(id);
    const stars = starAgg.get(id);
    const trend: PerfTrend =
      a.thisWeek > a.lastWeek ? 'up' : a.thisWeek < a.lastWeek ? 'down' : 'flat';
    const currentTask =
      runningTaskByUser.get(id) ??
      (active?.firstTaskId ? taskInfo.get(active.firstTaskId)?.title ?? null : null);
    return {
      userId: id,
      fullName: p?.full_name ?? null,
      hasAvatar: Boolean(p?.avatar_url),
      role: roleByUser.get(id)!,
      clockedIn: clockedIn.has(id),
      onBreak: onBreak.has(id),
      currentTask,
      activeTaskCount: active?.count ?? 0,
      weekDoneCount: a.thisWeek,
      weekDoneTitles: a.weekTitles,
      dayDoneCount: dayDoneCount.get(id) ?? 0,
      dayDoneTitles: a.dayTitles,
      dayMinutes: dayMinutesByUser.get(id) ?? 0,
      dayStatusChanges: dayStatusByUser.get(id) ?? 0,
      done30: a.done30,
      ontimePct: a.done30 > 0 ? Math.round(((ontimeByUser.get(id) ?? 0) / a.done30) * 100) : null,
      efficientPct: a.done30 > 0 ? Math.round(((efficientByUser.get(id) ?? 0) / a.done30) * 100) : null,
      avgStars: stars && stars.n > 0 ? Math.round((stars.sum / stars.n) * 10) / 10 : null,
      rework: a.rework,
      trend,
    };
  });

  // Sort: currently clocked in first, then most done this week.
  members.sort((x, y) => {
    if (x.clockedIn !== y.clockedIn) return x.clockedIn ? -1 : 1;
    if (y.weekDoneCount !== x.weekDoneCount) return y.weekDoneCount - x.weekDoneCount;
    return (x.fullName ?? '').localeCompare(y.fullName ?? '');
  });

  return { day: dayIso, members };
}
