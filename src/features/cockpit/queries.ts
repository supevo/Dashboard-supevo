import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getWorkloadOverview, type WorkloadLevel } from '@/features/workload/queries';
import { getCurrentAbsenceByUser } from '@/features/absences/queries';
import { levelForPoints } from '@/features/kudos/badges';
import { berlinToday } from '@/lib/time';

export interface CockpitRow {
  userId: string;
  name: string;
  hasAvatar: boolean;
  level: WorkloadLevel;
  activeTasks: number;
  overdue: number;
  weekMinutes: number;
  completedMonth: number;
  points: number;
  pointLevel: number;
  activeObjectives: number;
  avgProgress: number;
  absent: boolean;
}

/**
 * Per-employee boss cockpit: performance (open/overdue/completed/time),
 * gamification points+level, active OKRs progress and absence. Aggregated
 * org-wide via the service client; callers must verify org-admin first.
 */
export async function getCockpit(orgId: string): Promise<CockpitRow[]> {
  const [overview, absenceMap] = await Promise.all([
    getWorkloadOverview(orgId),
    getCurrentAbsenceByUser(),
  ]);
  const members = overview.members;
  const userIds = members.map((m) => m.userId);
  if (userIds.length === 0) return [];

  const service = createSupabaseServiceClient();
  const today = berlinToday();
  const monthStart = `${today.slice(0, 7)}-01`;

  // Kudos points per user.
  const { data: kudos } = await service
    .from('kudos')
    .select('to_user_id, points')
    .in('to_user_id', userIds);
  const kudosPts = new Map<string, number>();
  for (const k of kudos ?? []) {
    kudosPts.set(k.to_user_id, (kudosPts.get(k.to_user_id) ?? 0) + k.points);
  }

  // Automatische XP (Aufgaben, Ämtli, Zeit, Loot …) aus dem XP-Ledger. Punkte =
  // XP-Ledger + Kudos – identisch zur Team-Leiste, Liga und dem Leaderboard,
  // damit die „Punkte & Level"-Anzeige zu diesen konsistent (aktuell) ist.
  const { data: xpRows } = await service
    .from('xp_events')
    .select('user_id, points')
    .in('user_id', userIds);
  const xpPts = new Map<string, number>();
  for (const x of xpRows ?? []) {
    xpPts.set(x.user_id, (xpPts.get(x.user_id) ?? 0) + (x.points ?? 0));
  }

  // Objectives + key results per user.
  const { data: objectives } = await service
    .from('objectives')
    .select('id, user_id, status')
    .in('user_id', userIds);
  const objIds = (objectives ?? []).map((o) => o.id);
  const { data: krs } = objIds.length
    ? await service
        .from('key_results')
        .select('objective_id, done, points')
        .in('objective_id', objIds)
    : { data: [] as { objective_id: string; done: boolean; points: number }[] };
  const krByObj = new Map<string, { done: boolean; points: number }[]>();
  for (const k of krs ?? []) {
    const list = krByObj.get(k.objective_id) ?? [];
    list.push({ done: k.done, points: k.points });
    krByObj.set(k.objective_id, list);
  }
  const activeObj = new Map<string, number>();
  const progressSum = new Map<string, { sum: number; n: number }>();
  for (const o of objectives ?? []) {
    const list = krByObj.get(o.id) ?? [];
    if (o.status === 'active') {
      activeObj.set(o.user_id, (activeObj.get(o.user_id) ?? 0) + 1);
      const prog = list.length
        ? Math.round((list.filter((k) => k.done).length / list.length) * 100)
        : 0;
      const p = progressSum.get(o.user_id) ?? { sum: 0, n: 0 };
      p.sum += prog;
      p.n += 1;
      progressSum.set(o.user_id, p);
    }
  }

  // Completed tasks this month per assignee (done column, updated this month).
  const { data: doneCols } = await service
    .from('board_columns')
    .select('id, column_key')
    .eq('organization_id', orgId);
  const doneColIds = new Set(
    (doneCols ?? []).filter((c) => c.column_key === 'done').map((c) => c.id),
  );
  const { data: doneTasks } = await service
    .from('tasks')
    .select('id, column_id, updated_at')
    .eq('organization_id', orgId)
    .gte('updated_at', `${monthStart}T00:00:00`)
    .limit(3000);
  const doneTaskIds = (doneTasks ?? [])
    .filter((t) => doneColIds.has(t.column_id))
    .map((t) => t.id);
  const { data: doneAssignees } = doneTaskIds.length
    ? await service
        .from('task_assignees')
        .select('user_id, task_id')
        .in('task_id', doneTaskIds)
    : { data: [] as { user_id: string; task_id: string }[] };
  const completedMonth = new Map<string, number>();
  for (const a of doneAssignees ?? []) {
    completedMonth.set(a.user_id, (completedMonth.get(a.user_id) ?? 0) + 1);
  }

  return members.map((m) => {
    const points = (kudosPts.get(m.userId) ?? 0) + (xpPts.get(m.userId) ?? 0);
    const prog = progressSum.get(m.userId);
    return {
      userId: m.userId,
      name: m.fullName ?? m.email ?? '—',
      hasAvatar: m.hasAvatar,
      level: m.level,
      activeTasks: m.activeTasks,
      overdue: m.overdue,
      weekMinutes: m.weekMinutes,
      completedMonth: completedMonth.get(m.userId) ?? 0,
      points,
      pointLevel: levelForPoints(points).level,
      activeObjectives: activeObj.get(m.userId) ?? 0,
      avgProgress: prog && prog.n ? Math.round(prog.sum / prog.n) : 0,
      absent: absenceMap.has(m.userId),
    };
  });
}
