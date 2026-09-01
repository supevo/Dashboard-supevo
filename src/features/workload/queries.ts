import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { isAgencyRole } from '@/lib/authz/roles';
import {
  berlinToday,
  berlinMinutesOfDay,
  berlinWeekday,
  startOfBerlinDayUtc,
} from '@/lib/time';
import { lateTierForMinutes, type LateTier } from '@/features/time-tracking/lateness';
import type { AppRole } from '@/lib/authz/roles';

export type WorkloadLevel = 'red' | 'yellow' | 'green' | 'idle';

export interface MemberWorkload {
  userId: string;
  fullName: string | null;
  email: string | null;
  hasAvatar: boolean;
  role: AppRole;
  activeTasks: number;
  inProgress: number;
  review: number;
  overdue: number;
  blocked: number;
  dueSoon: number;
  weekMinutes: number;
  level: WorkloadLevel;
  /** Tardiness tier of today's first clock-in, or null when on time / n.a. */
  lateToday: LateTier | null;
}

export interface WorkloadOverview {
  members: MemberWorkload[];
  counts: { red: number; yellow: number; green: number; idle: number };
}

// Ampel thresholds by number of active (open, assigned) tasks. Overdue tasks
// always push a member to red — something is late and needs attention.
const RED_ACTIVE = 6;
const YELLOW_ACTIVE = 3;
const SOON_WINDOW_DAYS = 3;

function levelFor(active: number, overdue: number): WorkloadLevel {
  if (active === 0) return 'idle';
  if (overdue > 0 || active >= RED_ACTIVE) return 'red';
  if (active >= YELLOW_ACTIVE) return 'yellow';
  return 'green';
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Per-employee workload overview for the organization: open assigned tasks,
 * in-progress/review, overdue/blocked, time logged in the last 7 days, and a
 * traffic-light level. Agency staff only; uses the service client (after an
 * in-code agency check) to see every colleague's assignments org-wide.
 */
export async function getWorkloadOverview(
  orgId: string,
): Promise<WorkloadOverview> {
  const user = await requireUser();
  const empty: WorkloadOverview = {
    members: [],
    counts: { red: 0, yellow: 0, green: 0, idle: 0 },
  };
  if (!hasAgencyAccess(user)) return empty;

  const service = createSupabaseServiceClient();
  const today = berlinToday();
  const soonCutoff = addDays(today, SOON_WINDOW_DAYS);
  const weekStart = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Agency staff of this organization.
  const { data: memberships } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  const staff = (memberships ?? []).filter((m) => isAgencyRole(m.role));
  if (staff.length === 0) return empty;

  const roleByUser = new Map(staff.map((m) => [m.user_id, m.role] as const));
  const userIds = [...roleByUser.keys()];

  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .in('id', userIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p] as const));

  // Column keys for done/active/review classification.
  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key')
    .eq('organization_id', orgId);
  const keyByColumn = new Map(
    (columns ?? []).map((c) => [c.id, c.column_key] as const),
  );

  // Active, non-deleted tasks in this org.
  const { data: tasks } = await service
    .from('tasks')
    .select('id, column_id, due_date, is_blocked')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .limit(5000);
  const taskById = new Map((tasks ?? []).map((t) => [t.id, t] as const));

  // Assignments for our staff.
  const { data: assignees } = await service
    .from('task_assignees')
    .select('task_id, user_id')
    .in('user_id', userIds);

  // Time logged in the last 7 days per user.
  const { data: timeRows } = await service
    .from('time_entries')
    .select('user_id, duration_minutes')
    .in('user_id', userIds)
    .gte('started_at', weekStart)
    .not('ended_at', 'is', null);
  const weekMinutesByUser = new Map<string, number>();
  for (const r of timeRows ?? []) {
    weekMinutesByUser.set(
      r.user_id,
      (weekMinutesByUser.get(r.user_id) ?? 0) + (r.duration_minutes ?? 0),
    );
  }

  // Today's first clock-in per user + tardiness tier (workdays only, and never
  // for anyone on an approved absence today).
  const dayStart = startOfBerlinDayUtc();
  const isWeekendToday = berlinWeekday() >= 6;
  const [{ data: clockIns }, { data: absencesToday }] = await Promise.all([
    service
      .from('work_sessions')
      .select('user_id, clock_in')
      .in('user_id', userIds)
      .gte('clock_in', dayStart)
      .order('clock_in', { ascending: true }),
    service
      .from('absences')
      .select('user_id')
      .in('user_id', userIds)
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today),
  ]);
  const firstClockInByUser = new Map<string, string>();
  for (const r of clockIns ?? []) {
    if (!firstClockInByUser.has(r.user_id)) firstClockInByUser.set(r.user_id, r.clock_in);
  }
  const absentToday = new Set((absencesToday ?? []).map((a) => a.user_id));
  const lateTodayFor = (id: string): LateTier | null => {
    if (isWeekendToday || absentToday.has(id)) return null;
    const iso = firstClockInByUser.get(id);
    if (!iso) return null;
    return lateTierForMinutes(berlinMinutesOfDay(new Date(iso)));
  };

  // Initialize per-user accumulators.
  const acc = new Map<
    string,
    Omit<
      MemberWorkload,
      'userId' | 'fullName' | 'email' | 'hasAvatar' | 'role' | 'level' | 'lateToday'
    >
  >();
  for (const id of userIds) {
    acc.set(id, {
      activeTasks: 0,
      inProgress: 0,
      review: 0,
      overdue: 0,
      blocked: 0,
      dueSoon: 0,
      weekMinutes: weekMinutesByUser.get(id) ?? 0,
    });
  }

  for (const a of assignees ?? []) {
    const task = taskById.get(a.task_id);
    const bucket = acc.get(a.user_id);
    if (!task || !bucket) continue;
    const key = keyByColumn.get(task.column_id);
    if (key === 'done') continue; // finished — not part of the load

    bucket.activeTasks++;
    if (key === 'active') bucket.inProgress++;
    if (key === 'review') bucket.review++;
    if (task.is_blocked) bucket.blocked++;
    if (task.due_date) {
      if (task.due_date < today) bucket.overdue++;
      else if (task.due_date <= soonCutoff) bucket.dueSoon++;
    }
  }

  const counts = { red: 0, yellow: 0, green: 0, idle: 0 };
  const members: MemberWorkload[] = userIds.map((id) => {
    const b = acc.get(id)!;
    const profile = profileById.get(id);
    const level = levelFor(b.activeTasks, b.overdue);
    counts[level]++;
    return {
      userId: id,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      hasAvatar: Boolean(profile?.avatar_url),
      role: roleByUser.get(id)!,
      level,
      lateToday: lateTodayFor(id),
      ...b,
    };
  });

  // Busiest first: red → yellow → green → idle, then by active task count.
  const levelRank: Record<WorkloadLevel, number> = {
    red: 0,
    yellow: 1,
    green: 2,
    idle: 3,
  };
  members.sort((a, b) => {
    if (levelRank[a.level] !== levelRank[b.level]) {
      return levelRank[a.level] - levelRank[b.level];
    }
    if (b.activeTasks !== a.activeTasks) return b.activeTasks - a.activeTasks;
    return (a.fullName ?? '').localeCompare(b.fullName ?? '');
  });

  return { members, counts };
}
