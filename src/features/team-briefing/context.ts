import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { berlinToday } from '@/lib/time';
import type { TaskPriority } from '@/lib/database.types';

export interface TeamTaskRef {
  title: string;
  projectName: string;
  assignees: string[];
  priority: TaskPriority;
  dueDate: string | null;
}

export interface TeamContext {
  today: string;
  memberLoad: { name: string; active: number; overdue: number; level: string }[];
  overdue: TeamTaskRef[];
  blocked: TeamTaskRef[];
  dueSoon: TeamTaskRef[];
  unassignedOpen: number;
}

const SOON_DAYS = 7;
const CAP = 15;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Gathers an organization-wide snapshot for the team weekly overview: per-member
 * load, plus overdue / blocked / soon-due tasks with assignees. Service client
 * (org-wide); callers must verify agency access first.
 */
export async function gatherTeamContext(orgId: string): Promise<TeamContext> {
  const service = createSupabaseServiceClient();
  const today = berlinToday();
  const soon = addDays(today, SOON_DAYS);

  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key')
    .eq('organization_id', orgId);
  const keyByColumn = new Map(
    (columns ?? []).map((c) => [c.id, c.column_key] as const),
  );

  const { data: tasks } = await service
    .from('tasks')
    .select('id, title, project_id, priority, column_id, due_date, is_blocked')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .limit(3000);
  const activeTasks = (tasks ?? []).filter(
    (t) => keyByColumn.get(t.column_id) !== 'done',
  );

  const projectIds = [...new Set(activeTasks.map((t) => t.project_id))];
  const { data: projects } = projectIds.length
    ? await service.from('projects').select('id, name').in('id', projectIds)
    : { data: [] };
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const taskIds = activeTasks.map((t) => t.id);
  const { data: assignees } = taskIds.length
    ? await service
        .from('task_assignees')
        .select('task_id, user_id')
        .in('task_id', taskIds)
    : { data: [] };
  const userIds = [...new Set((assignees ?? []).map((a) => a.user_id))];
  const { data: profiles } = userIds.length
    ? await service.from('profiles').select('id, full_name').in('id', userIds)
    : { data: [] };
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? '—'] as const),
  );
  const assigneeNames = new Map<string, string[]>();
  const assignedCount = new Map<string, number>();
  for (const a of assignees ?? []) {
    const list = assigneeNames.get(a.task_id) ?? [];
    list.push(nameById.get(a.user_id) ?? '—');
    assigneeNames.set(a.task_id, list);
  }
  const assignedTaskIds = new Set((assignees ?? []).map((a) => a.task_id));

  const ref = (t: (typeof activeTasks)[number]): TeamTaskRef => ({
    title: t.title,
    projectName: projectName.get(t.project_id) ?? '—',
    assignees: assigneeNames.get(t.id) ?? [],
    priority: t.priority,
    dueDate: t.due_date,
  });

  const overdue: TeamTaskRef[] = [];
  const blocked: TeamTaskRef[] = [];
  const dueSoon: TeamTaskRef[] = [];
  let unassignedOpen = 0;

  // Per-member load.
  for (const a of assignees ?? []) {
    assignedCount.set(a.user_id, (assignedCount.get(a.user_id) ?? 0) + 1);
  }
  const overdueByUser = new Map<string, number>();

  for (const t of activeTasks) {
    if (!assignedTaskIds.has(t.id)) unassignedOpen++;
    if (t.is_blocked && blocked.length < CAP) blocked.push(ref(t));
    if (t.due_date) {
      if (t.due_date < today) {
        if (overdue.length < CAP) overdue.push(ref(t));
        for (const a of assignees ?? []) {
          if (a.task_id === t.id)
            overdueByUser.set(
              a.user_id,
              (overdueByUser.get(a.user_id) ?? 0) + 1,
            );
        }
      } else if (t.due_date <= soon && dueSoon.length < CAP) {
        dueSoon.push(ref(t));
      }
    }
  }

  const memberLoad = [...assignedCount.entries()]
    .map(([uid, active]) => {
      const overdueCount = overdueByUser.get(uid) ?? 0;
      const level =
        overdueCount > 0 || active >= 6
          ? 'überlastet'
          : active >= 3
            ? 'gut ausgelastet'
            : 'im Rahmen';
      return { name: nameById.get(uid) ?? '—', active, overdue: overdueCount, level };
    })
    .sort((a, b) => b.active - a.active);

  return { today, memberLoad, overdue, blocked, dueSoon, unassignedOpen };
}
