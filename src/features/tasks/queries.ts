import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ColumnKey, TaskPriority } from '@/lib/database.types';

export interface TaskAssignee {
  userId: string;
  name: string;
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
      'id, title, priority, is_internal, is_blocked, due_date, column_id, position, lock_version',
    )
    .eq('board_id', board.id)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .order('position', { ascending: true });

  const taskIds = (tasks ?? []).map((t) => t.id);
  const assigneesByTask = new Map<string, TaskAssignee[]>();
  if (taskIds.length > 0) {
    const { data: assignees } = await supabase
      .from('task_assignees')
      .select('task_id, user_id')
      .in('task_id', taskIds);
    const userIds = [...new Set((assignees ?? []).map((a) => a.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name ?? ''] as const),
    );
    for (const a of assignees ?? []) {
      const list = assigneesByTask.get(a.task_id) ?? [];
      list.push({ userId: a.user_id, name: nameById.get(a.user_id) ?? '' });
      assigneesByTask.set(a.task_id, list);
    }
  }

  const columnsOut: BoardColumn[] = (columns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    columnKey: c.column_key,
    position: c.position,
    wipLimit: c.wip_limit,
    wipLimitPerUser: c.wip_limit_per_user,
    isDoneColumn: c.is_done_column,
    tasks: (tasks ?? [])
      .filter((t) => t.column_id === c.id)
      .map((t) => ({
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
      })),
  }));

  return { boardId: board.id, columns: columnsOut };
}
