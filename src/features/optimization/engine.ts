import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { isAgencyRole } from '@/lib/authz/roles';
import { berlinToday } from '@/lib/time';

export interface OptimizationResult {
  assigned: number;
  reassigned: number;
  changes: string[];
}

interface Cand {
  id: string;
  name: string;
  competence: number; // skills + preferences (soft tiebreaker)
  absent: boolean;
  load: number;
}

const MAX_MOVES = 40; // safety cap on total changes per run
const BALANCE_GAP = 3; // rebalance until max-min load ≤ this

/**
 * Heuristically optimizes the org's work distribution:
 *  1. assigns open tasks that have no owner to the best-suited available person,
 *  2. (when reassign) moves tasks off currently-absent people, and
 *  3. (when reassign) rebalances load from the most- to the least-loaded people.
 * "Best" = lowest current load first, higher competence (skills + Lieblingsarbeit)
 * as a tiebreaker; absent people are never chosen. Notifies new assignees.
 * Runs with the service client, so it works both from an admin action and cron.
 */
export async function runWorkloadOptimization(
  orgId: string,
  actorId: string | null,
  opts: { reassign: boolean },
): Promise<OptimizationResult> {
  const service = createSupabaseServiceClient();
  const changes: string[] = [];
  let assigned = 0;
  let reassigned = 0;

  // Candidate pool: active agency staff.
  const { data: memberships } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  const staffIds = [
    ...new Set((memberships ?? []).filter((m) => isAgencyRole(m.role)).map((m) => m.user_id)),
  ];
  if (staffIds.length === 0) return { assigned, reassigned, changes };

  const today = berlinToday();
  const [{ data: profiles }, { data: skills }, { data: prefs }, { data: absences }] =
    await Promise.all([
      service.from('profiles').select('id, full_name').in('id', staffIds),
      service.from('employee_skills').select('user_id, level').in('user_id', staffIds),
      service.from('work_preferences').select('user_id, level').in('user_id', staffIds),
      service
        .from('absences')
        .select('user_id')
        .in('user_id', staffIds)
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today),
    ]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? '—'] as const));
  const absentSet = new Set((absences ?? []).map((a) => a.user_id));
  const compById = new Map<string, number>();
  for (const s of skills ?? []) compById.set(s.user_id, (compById.get(s.user_id) ?? 0) + s.level);
  for (const p of prefs ?? [])
    compById.set(p.user_id, (compById.get(p.user_id) ?? 0) + p.level * 1.5);

  // Open tasks (not done, not archived, not deleted).
  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key')
    .eq('organization_id', orgId);
  const doneCols = new Set((columns ?? []).filter((c) => c.column_key === 'done').map((c) => c.id));
  const { data: taskRows } = await service
    .from('tasks')
    .select('id, title, column_id')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .limit(5000);
  const openTasks = (taskRows ?? []).filter((t) => !doneCols.has(t.column_id));
  const openTaskIds = new Set(openTasks.map((t) => t.id));
  const titleById = new Map(openTasks.map((t) => [t.id, t.title] as const));

  // Assignees of open tasks.
  const { data: assignRows } = openTaskIds.size
    ? await service
        .from('task_assignees')
        .select('task_id, user_id')
        .in('task_id', [...openTaskIds])
    : { data: [] as { task_id: string; user_id: string }[] };
  const assigneesByTask = new Map<string, string[]>();
  const load = new Map<string, number>();
  for (const id of staffIds) load.set(id, 0);
  for (const a of assignRows ?? []) {
    const list = assigneesByTask.get(a.task_id) ?? [];
    list.push(a.user_id);
    assigneesByTask.set(a.task_id, list);
    if (staffIds.includes(a.user_id)) load.set(a.user_id, (load.get(a.user_id) ?? 0) + 1);
  }

  const cands = (): Cand[] =>
    staffIds.map((id) => ({
      id,
      name: nameById.get(id) ?? '—',
      competence: compById.get(id) ?? 0,
      absent: absentSet.has(id),
      load: load.get(id) ?? 0,
    }));

  /** Best available (non-absent) person, excluding given ids. */
  const pickBest = (exclude: Set<string> = new Set()): Cand | null => {
    const pool = cands().filter((c) => !c.absent && !exclude.has(c.id));
    if (pool.length === 0) return null;
    pool.sort((a, b) => a.load - b.load || b.competence - a.competence);
    return pool[0] ?? null;
  };

  const newAssignments: { taskId: string; userId: string }[] = [];

  // 1) Assign unassigned open tasks.
  for (const t of openTasks) {
    if (changes.length >= MAX_MOVES) break;
    const cur = assigneesByTask.get(t.id) ?? [];
    if (cur.length > 0) continue;
    const pick = pickBest();
    if (!pick) break;
    await service.from('task_assignees').insert({ task_id: t.id, user_id: pick.id, organization_id: orgId });
    load.set(pick.id, (load.get(pick.id) ?? 0) + 1);
    assigneesByTask.set(t.id, [pick.id]);
    newAssignments.push({ taskId: t.id, userId: pick.id });
    changes.push(`„${t.title}" → ${pick.name} (war ohne Verantwortlichen)`);
    assigned++;
  }

  if (opts.reassign) {
    // 2) Move tasks off people who are currently absent.
    for (const [taskId, list] of assigneesByTask) {
      if (changes.length >= MAX_MOVES) break;
      const staffAssignees = list.filter((u) => staffIds.includes(u));
      if (staffAssignees.length === 0) continue;
      const allAbsent = staffAssignees.every((u) => absentSet.has(u));
      if (!allAbsent) continue;
      const pick = pickBest(new Set(list));
      if (!pick) continue;
      await service.from('task_assignees').delete().eq('task_id', taskId).in('user_id', staffAssignees);
      await service.from('task_assignees').insert({ task_id: taskId, user_id: pick.id, organization_id: orgId });
      for (const u of staffAssignees) load.set(u, Math.max(0, (load.get(u) ?? 0) - 1));
      load.set(pick.id, (load.get(pick.id) ?? 0) + 1);
      assigneesByTask.set(taskId, [pick.id]);
      newAssignments.push({ taskId, userId: pick.id });
      const oldNames = staffAssignees.map((u) => nameById.get(u) ?? '—').join(', ');
      changes.push(`„${titleById.get(taskId) ?? ''}“: ${oldNames} (abwesend) → ${pick.name}`);
      reassigned++;
    }

    // 3) Rebalance: move single-owner tasks from the most- to least-loaded.
    // Precompute movable tasks (single available owner) per user.
    const movableByUser = new Map<string, string[]>();
    for (const [taskId, list] of assigneesByTask) {
      const staffAssignees = list.filter((u) => staffIds.includes(u));
      if (staffAssignees.length !== 1) continue;
      const owner = staffAssignees[0]!;
      if (absentSet.has(owner)) continue;
      const arr = movableByUser.get(owner) ?? [];
      arr.push(taskId);
      movableByUser.set(owner, arr);
    }
    for (let i = 0; i < MAX_MOVES && changes.length < MAX_MOVES; i++) {
      const avail = cands().filter((c) => !c.absent);
      if (avail.length < 2) break;
      avail.sort((a, b) => a.load - b.load);
      const min = avail[0]!;
      const max = avail[avail.length - 1]!;
      if (max.load - min.load <= BALANCE_GAP) break;
      const pool = movableByUser.get(max.id) ?? [];
      const taskId = pool.pop();
      if (!taskId) break; // nothing movable from the busiest → stop
      await service.from('task_assignees').delete().eq('task_id', taskId).eq('user_id', max.id);
      await service.from('task_assignees').insert({ task_id: taskId, user_id: min.id, organization_id: orgId });
      load.set(max.id, (load.get(max.id) ?? 0) - 1);
      load.set(min.id, (load.get(min.id) ?? 0) + 1);
      const minArr = movableByUser.get(min.id) ?? [];
      minArr.push(taskId);
      movableByUser.set(min.id, minArr);
      newAssignments.push({ taskId, userId: min.id });
      changes.push(`„${titleById.get(taskId) ?? ''}“: ${max.name} → ${min.name} (Entlastung)`);
      reassigned++;
    }
  }

  // Notify the new assignees (skip the actor).
  if (newAssignments.length > 0) {
    await createNotifications(
      newAssignments.map((n) => ({
        organizationId: orgId,
        recipientId: n.userId,
        type: 'task_assigned' as const,
        title: 'Neue Aufgabe zugewiesen (KI-Optimierung)',
        body: titleById.get(n.taskId) ?? null,
        entityType: 'task',
        entityId: n.taskId,
      })),
      actorId ?? undefined,
    );
  }

  return { assigned, reassigned, changes };
}
