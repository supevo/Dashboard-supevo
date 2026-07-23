import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getWorkStatus, getRunningTimer } from '@/features/time-tracking/queries';
import { berlinToday } from '@/lib/time';
import type { RunningTimer } from '@/features/time-tracking/queries';

export interface DashboardTaskRef {
  id: string;
  title: string;
}

export interface AgencyDashboard {
  myActive: DashboardTaskRef[];
  inReviewCount: number;
  overdueCount: number;
  dueTodayCount: number;
  blockedCount: number;
  openApprovalsCount: number;
  workTodayMinutes: number;
  runningTimer: RunningTimer | null;
  recentActivity: { id: string; action: string; createdAt: string }[];
}

export async function getAgencyDashboard(
  userId: string,
): Promise<AgencyDashboard> {
  const supabase = await createSupabaseServerClient();
  const today = berlinToday();

  // Column key lookup for accessible boards.
  const { data: columns } = await supabase
    .from('board_columns')
    .select('id, column_key');
  const keyByColumn = new Map(
    (columns ?? []).map((c) => [c.id, c.column_key] as const),
  );

  // Accessible, active tasks.
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, column_id, due_date, is_blocked')
    .eq('is_archived', false)
    .is('deleted_at', null)
    .limit(1000);

  // My assignments.
  const { data: mine } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('user_id', userId);
  const myTaskIds = new Set((mine ?? []).map((m) => m.task_id));

  const isDone = (columnId: string) => keyByColumn.get(columnId) === 'done';

  const myActive: DashboardTaskRef[] = [];
  let inReviewCount = 0;
  let overdueCount = 0;
  let dueTodayCount = 0;
  let blockedCount = 0;

  for (const t of tasks ?? []) {
    const done = isDone(t.column_id);
    if (myTaskIds.has(t.id) && !done) {
      myActive.push({ id: t.id, title: t.title });
    }
    if (keyByColumn.get(t.column_id) === 'review') inReviewCount++;
    if (t.is_blocked) blockedCount++;
    if (!done && t.due_date) {
      if (t.due_date < today) overdueCount++;
      else if (t.due_date === today) dueTodayCount++;
    }
  }

  const { count: openApprovalsCount } = await supabase
    .from('approvals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  const [workStatus, runningTimer] = await Promise.all([
    getWorkStatus(userId),
    getRunningTimer(userId),
  ]);

  const { data: activity } = await supabase
    .from('activity_log')
    .select('id, action, created_at')
    .order('created_at', { ascending: false })
    .limit(8);

  return {
    myActive: myActive.slice(0, 8),
    inReviewCount,
    overdueCount,
    dueTodayCount,
    blockedCount,
    openApprovalsCount: openApprovalsCount ?? 0,
    workTodayMinutes: workStatus.todayMinutes,
    runningTimer,
    recentActivity: (activity ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      createdAt: a.created_at,
    })),
  };
}

export interface ClientDashboard {
  openCount: number;
  inProgressCount: number;
  toApproveCount: number;
  completedRecent: DashboardTaskRef[];
}

export async function getClientDashboard(): Promise<ClientDashboard> {
  const supabase = await createSupabaseServerClient();

  const { data: columns } = await supabase
    .from('board_columns')
    .select('id, column_key');
  const keyByColumn = new Map(
    (columns ?? []).map((c) => [c.id, c.column_key] as const),
  );

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, column_id')
    .eq('is_archived', false)
    .is('deleted_at', null)
    .limit(1000);

  let openCount = 0;
  let inProgressCount = 0;
  const completedRecent: DashboardTaskRef[] = [];
  for (const t of tasks ?? []) {
    const key = keyByColumn.get(t.column_id);
    if (key === 'queue') openCount++;
    else if (key === 'active' || key === 'review') inProgressCount++;
    else if (key === 'done' && completedRecent.length < 8)
      completedRecent.push({ id: t.id, title: t.title });
  }

  const { count: toApproveCount } = await supabase
    .from('approvals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return {
    openCount,
    inProgressCount,
    toApproveCount: toApproveCount ?? 0,
    completedRecent,
  };
}
