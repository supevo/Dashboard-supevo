import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ColumnKey, TaskPriority } from '@/lib/database.types';

export interface TaskDetail {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  isInternal: boolean;
  isBlocked: boolean;
  isArchived: boolean;
  dueDate: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number;
  lockVersion: number;
  assignees: TaskAssignee[];
  canManage: boolean;
}

/** Loads a single task the user can access, with assignees and manage flag. */
export async function getTaskDetail(taskId: string): Promise<TaskDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select(
      'id, organization_id, project_id, title, description, priority, is_internal, is_blocked, is_archived, due_date, estimated_minutes, actual_minutes, lock_version',
    )
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!task) return null;

  const { data: assigneeRows } = await supabase
    .from('task_assignees')
    .select('user_id')
    .eq('task_id', taskId);
  const ids = (assigneeRows ?? []).map((a) => a.user_id);
  const { data: profiles } = ids.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', ids)
    : { data: [] };
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? ''] as const),
  );
  const avatarById = new Map(
    (profiles ?? []).map((p) => [p.id, Boolean(p.avatar_url)] as const),
  );

  const { data: canManage } = await supabase.rpc('can_manage_project', {
    p_project_id: task.project_id,
  });

  return {
    id: task.id,
    organizationId: task.organization_id,
    projectId: task.project_id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    isInternal: task.is_internal,
    isBlocked: task.is_blocked,
    isArchived: task.is_archived,
    dueDate: task.due_date,
    estimatedMinutes: task.estimated_minutes,
    actualMinutes: task.actual_minutes,
    lockVersion: task.lock_version,
    assignees: ids.map((id) => ({
      userId: id,
      name: nameById.get(id) ?? '',
      hasAvatar: avatarById.get(id) ?? false,
    })),
    canManage: canManage === true,
  };
}

export interface TaskAssignee {
  userId: string;
  name: string;
  hasAvatar: boolean;
}

export interface BoardTaskLabel {
  id: string;
  name: string;
  color: string;
  intensity: number;
}

export interface BoardTask {
  id: string;
  title: string;
  priority: TaskPriority;
  isInternal: boolean;
  isBlocked: boolean;
  dueDate: string | null;
  columnId: string;
  position: number;
  lockVersion: number;
  assignees: TaskAssignee[];
  labels: BoardTaskLabel[];
  attachmentCount: number;
  /** Whole days the task has sat in its current column (null for done cards). */
  agingDays: number | null;
  /** Completed task awaiting the current viewer's kudos rating. */
  needsRating: boolean;
}

export interface BoardColumn {
  id: string;
  name: string;
  columnKey: ColumnKey;
  position: number;
  wipLimit: number | null;
  wipLimitPerUser: number | null;
  isDoneColumn: boolean;
  tasks: BoardTask[];
}

export interface BoardView {
  boardId: string;
  columns: BoardColumn[];
  /** Archived tasks, shown in a read-only "Archiv" column. */
  archived: BoardTask[];
}

/** Loads the first board of a project with its columns and active tasks.
 *  RLS ensures internal tasks are hidden from clients. */
export async function getBoardView(
  projectId: string,
): Promise<BoardView | null> {
  const supabase = await createSupabaseServerClient();

  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!board) return null;

  const { data: columns } = await supabase
    .from('board_columns')
    .select(
      'id, name, column_key, position, wip_limit, wip_limit_per_user, is_done_column',
    )
    .eq('board_id', board.id)
    .order('position', { ascending: true });

  const { data: tasks } = await supabase
    .from('tasks')
    .select(
      'id, title, priority, is_internal, is_blocked, due_date, column_id, position, lock_version, column_entered_at, completed_by',
    )
    .eq('board_id', board.id)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .order('position', { ascending: true });

  const { data: archivedRows } = await supabase
    .from('tasks')
    .select(
      'id, title, priority, is_internal, is_blocked, due_date, column_id, position, lock_version, column_entered_at, completed_by',
    )
    .eq('board_id', board.id)
    .eq('is_archived', true)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(100);

  const taskIds = [
    ...(tasks ?? []).map((t) => t.id),
    ...(archivedRows ?? []).map((t) => t.id),
  ];
  const assigneesByTask = new Map<string, TaskAssignee[]>();
  if (taskIds.length > 0) {
    const { data: assignees } = await supabase
      .from('task_assignees')
      .select('task_id, user_id')
      .in('task_id', taskIds);
    const userIds = [...new Set((assignees ?? []).map((a) => a.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name ?? ''] as const),
    );
    const avatarById = new Map(
      (profiles ?? []).map((p) => [p.id, Boolean(p.avatar_url)] as const),
    );
    for (const a of assignees ?? []) {
      const list = assigneesByTask.get(a.task_id) ?? [];
      list.push({
        userId: a.user_id,
        name: nameById.get(a.user_id) ?? '',
        hasAvatar: avatarById.get(a.user_id) ?? false,
      });
      assigneesByTask.set(a.task_id, list);
    }
  }

  // Labels per task (RLS hides client-invisible labels from clients).
  const labelsByTask = new Map<string, BoardTaskLabel[]>();
  if (taskIds.length > 0) {
    const { data: taskLabels } = await supabase
      .from('task_labels')
      .select('task_id, label_id')
      .in('task_id', taskIds);
    const labelIds = [...new Set((taskLabels ?? []).map((r) => r.label_id))];
    if (labelIds.length > 0) {
      const { data: labels } = await supabase
        .from('labels')
        .select('id, name, color, intensity')
        .in('id', labelIds);
      const labelById = new Map((labels ?? []).map((l) => [l.id, l] as const));
      for (const tl of taskLabels ?? []) {
        const label = labelById.get(tl.label_id);
        if (!label) continue;
        const list = labelsByTask.get(tl.task_id) ?? [];
        list.push({
          id: label.id,
          name: label.name,
          color: label.color,
          intensity: label.intensity ?? 1,
        });
        labelsByTask.set(tl.task_id, list);
      }
    }
  }

  // Attachment counts per task.
  const attachmentsByTask = new Map<string, number>();
  if (taskIds.length > 0) {
    const { data: files } = await supabase
      .from('files')
      .select('task_id')
      .in('task_id', taskIds)
      .is('deleted_at', null);
    for (const f of files ?? []) {
      if (!f.task_id) continue;
      attachmentsByTask.set(
        f.task_id,
        (attachmentsByTask.get(f.task_id) ?? 0) + 1,
      );
    }
  }

  const daysSince = (iso: string | null): number | null => {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    return ms > 0 ? Math.floor(ms / 86_400_000) : 0;
  };

  // A completed task in a done column awaits the current viewer's kudos rating,
  // unless they completed it themselves or already rated it.
  const doneColumnIds = new Set(
    (columns ?? []).filter((c) => c.is_done_column).map((c) => c.id),
  );
  const { data: authData } = await supabase.auth.getUser();
  const meId = authData.user?.id ?? null;
  const ratedTaskIds = new Set<string>();
  if (meId && taskIds.length > 0) {
    const { data: myKudos } = await supabase
      .from('kudos')
      .select('task_id')
      .eq('from_user_id', meId)
      .in('task_id', taskIds);
    for (const k of myKudos ?? []) if (k.task_id) ratedTaskIds.add(k.task_id);
  }
  const needsRatingFor = (t: { id: string; column_id: string; completed_by: string | null }) =>
    doneColumnIds.has(t.column_id) &&
    !!t.completed_by &&
    t.completed_by !== meId &&
    !ratedTaskIds.has(t.id);

  type TaskRow = NonNullable<typeof tasks>[number];
  const toBoardTask = (t: TaskRow, withAging: boolean): BoardTask => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    isInternal: t.is_internal,
    isBlocked: t.is_blocked,
    dueDate: t.due_date,
    columnId: t.column_id,
    position: t.position,
    lockVersion: t.lock_version,
    assignees: assigneesByTask.get(t.id) ?? [],
    labels: labelsByTask.get(t.id) ?? [],
    attachmentCount: attachmentsByTask.get(t.id) ?? 0,
    agingDays: withAging ? daysSince(t.column_entered_at) : null,
    needsRating: needsRatingFor(t),
  });

  const columnsOut: BoardColumn[] = (columns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    columnKey: c.column_key,
    position: c.position,
    wipLimit: c.wip_limit,
    wipLimitPerUser: c.wip_limit_per_user,
    isDoneColumn: c.is_done_column,
    // Aging is only meaningful for in-progress work, not the done column.
    tasks: (tasks ?? [])
      .filter((t) => t.column_id === c.id)
      .map((t) => toBoardTask(t, !c.is_done_column)),
  }));

  const archived = (archivedRows ?? []).map((t) => toBoardTask(t, false));

  return { boardId: board.id, columns: columnsOut, archived };
}
