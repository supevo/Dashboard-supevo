import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { listColleagues } from '@/features/team/colleague';

export interface RailActivity {
  taskTitle: string;
  projectName: string | null;
  /** true = live (timer running), false = last worked on. */
  live: boolean;
}

export interface RailMember {
  userId: string;
  name: string;
  hasAvatar: boolean;
  status: string | null;
  roleLabel: string;
  level: number;
  isSelf: boolean;
  activity: RailActivity | null;
}

export interface TeamRailData {
  self: RailMember | null;
  members: RailMember[];
}

/**
 * Where each teammate currently is: the running timer's task/project (live),
 * otherwise the task they most recently opened. Service client (org-wide) –
 * only agency staff ever reach this (the rail is agency-only).
 */
async function getTeamActivity(
  userIds: string[],
): Promise<Map<string, RailActivity>> {
  const out = new Map<string, RailActivity>();
  if (userIds.length === 0) return out;
  const service = createSupabaseServiceClient();

  const { data: timers } = await service
    .from('time_entries')
    .select('user_id, task_id, project_id')
    .in('user_id', userIds)
    .eq('source', 'timer')
    .is('ended_at', null);
  const live = new Map<string, { taskId: string | null; projectId: string | null }>();
  for (const t of timers ?? []) {
    if (!live.has(t.user_id)) live.set(t.user_id, { taskId: t.task_id, projectId: t.project_id });
  }

  const need = userIds.filter((id) => !live.has(id));
  const last = new Map<string, string>(); // user_id -> task_id
  if (need.length > 0) {
    const { data: views } = await service
      .from('task_views')
      .select('user_id, task_id, opened_at')
      .in('user_id', need)
      .order('opened_at', { ascending: false })
      .limit(3000);
    for (const v of views ?? []) {
      if (!last.has(v.user_id)) last.set(v.user_id, v.task_id);
    }
  }

  const taskIds = [
    ...[...live.values()].map((v) => v.taskId).filter((x): x is string => !!x),
    ...last.values(),
  ];
  const taskById = new Map<string, { title: string; projectId: string | null }>();
  if (taskIds.length > 0) {
    const { data: tasks } = await service
      .from('tasks')
      .select('id, title, project_id')
      .in('id', [...new Set(taskIds)]);
    for (const t of tasks ?? []) taskById.set(t.id, { title: t.title, projectId: t.project_id });
  }

  const projectIds = [
    ...[...taskById.values()].map((t) => t.projectId),
    ...[...live.values()].map((v) => v.projectId),
  ].filter((x): x is string => !!x);
  const projById = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projects } = await service
      .from('projects')
      .select('id, name')
      .in('id', [...new Set(projectIds)]);
    for (const p of projects ?? []) projById.set(p.id, p.name);
  }

  for (const [uid, v] of live) {
    const task = v.taskId ? taskById.get(v.taskId) : null;
    const projId = task?.projectId ?? v.projectId ?? null;
    out.set(uid, {
      taskTitle: task?.title ?? 'Zeiterfassung läuft',
      projectName: projId ? projById.get(projId) ?? null : null,
      live: true,
    });
  }
  for (const [uid, taskId] of last) {
    const task = taskById.get(taskId);
    if (!task) continue;
    out.set(uid, {
      taskTitle: task.title,
      projectName: task.projectId ? projById.get(task.projectId) ?? null : null,
      live: false,
    });
  }
  return out;
}

/** Builds the team rail (own profile + colleagues with presence + activity). */
export async function getTeamRail(): Promise<TeamRailData | null> {
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return null;
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return null;

  const colleagues = await listColleagues(orgId); // agency-guarded, includes self
  const activity = await getTeamActivity(colleagues.map((c) => c.userId));

  const members: RailMember[] = colleagues.map((c) => ({
    userId: c.userId,
    name: c.name,
    hasAvatar: c.hasAvatar,
    status: c.status,
    roleLabel: c.roleLabel,
    level: c.level,
    isSelf: c.isSelf,
    activity: activity.get(c.userId) ?? null,
  }));

  return {
    self: members.find((m) => m.isSelf) ?? null,
    members: members.filter((m) => !m.isSelf),
  };
}
