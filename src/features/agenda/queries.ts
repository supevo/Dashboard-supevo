import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { berlinToday } from '@/lib/time';
import type { TaskPriority } from '@/lib/database.types';

export interface AgendaTask {
  id: string;
  title: string;
  projectName: string;
  priority: TaskPriority;
  dueDate: string | null;
  assignees: string[];
}

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

export interface MyTasks {
  overdue: AgendaTask[];
  today: AgendaTask[];
  week: AgendaTask[];
  later: AgendaTask[];
  none: AgendaTask[];
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function bucketFor(due: string | null, today: string, weekEnd: string): DueBucket {
  if (!due) return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due <= weekEnd) return 'week';
  return 'later';
}

async function loadColumns(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data } = await supabase.from('board_columns').select('id, column_key');
  return new Map((data ?? []).map((c) => [c.id, c.column_key] as const));
}

/** The current user's open assigned tasks, grouped by due date. RLS-scoped. */
export async function getMyTasks(userId: string): Promise<MyTasks> {
  const supabase = await createSupabaseServerClient();
  const today = berlinToday();
  const weekEnd = addDays(today, 7);
  const empty: MyTasks = { overdue: [], today: [], week: [], later: [], none: [] };

  const { data: rows } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('user_id', userId);
  const taskIds = [...new Set((rows ?? []).map((r) => r.task_id))];
  if (taskIds.length === 0) return empty;

  const keyByColumn = await loadColumns(supabase);
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, project_id, priority, due_date, column_id')
    .in('id', taskIds)
    .eq('is_archived', false)
    .is('deleted_at', null);
  const open = (tasks ?? []).filter((t) => keyByColumn.get(t.column_id) !== 'done');
  if (open.length === 0) return empty;

  const projectIds = [...new Set(open.map((t) => t.project_id))];
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .in('id', projectIds);
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const result: MyTasks = { overdue: [], today: [], week: [], later: [], none: [] };
  for (const t of open) {
    const task: AgendaTask = {
      id: t.id,
      title: t.title,
      projectName: projectName.get(t.project_id) ?? '—',
      priority: t.priority,
      dueDate: t.due_date,
      assignees: [],
    };
    result[bucketFor(t.due_date, today, weekEnd)].push(task);
  }
  const byDue = (a: AgendaTask, b: AgendaTask) =>
    (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
  result.overdue.sort(byDue);
  result.today.sort(byDue);
  result.week.sort(byDue);
  result.later.sort(byDue);
  return result;
}

export interface DeadlineDay {
  date: string;
  tasks: AgendaTask[];
}

/** Upcoming task deadlines across accessible projects, grouped by day. */
export async function getUpcomingDeadlines(days = 14): Promise<DeadlineDay[]> {
  const supabase = await createSupabaseServerClient();
  const today = berlinToday();
  const until = addDays(today, days);

  const keyByColumn = await loadColumns(supabase);
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, project_id, priority, due_date, column_id')
    .gte('due_date', today)
    .lte('due_date', until)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .order('due_date', { ascending: true })
    .limit(300);
  const open = (tasks ?? []).filter((t) => keyByColumn.get(t.column_id) !== 'done');
  if (open.length === 0) return [];

  const projectIds = [...new Set(open.map((t) => t.project_id))];
  const taskIds = open.map((t) => t.id);
  const [{ data: projects }, { data: assignees }] = await Promise.all([
    supabase.from('projects').select('id, name').in('id', projectIds),
    supabase.from('task_assignees').select('task_id, user_id').in('task_id', taskIds),
  ]);
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const userIds = [...new Set((assignees ?? []).map((a) => a.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? '—'] as const));
  const assigneesByTask = new Map<string, string[]>();
  for (const a of assignees ?? []) {
    const list = assigneesByTask.get(a.task_id) ?? [];
    list.push(nameById.get(a.user_id) ?? '—');
    assigneesByTask.set(a.task_id, list);
  }

  const byDate = new Map<string, AgendaTask[]>();
  for (const t of open) {
    if (!t.due_date) continue;
    const list = byDate.get(t.due_date) ?? [];
    list.push({
      id: t.id,
      title: t.title,
      projectName: projectName.get(t.project_id) ?? '—',
      priority: t.priority,
      dueDate: t.due_date,
      assignees: assigneesByTask.get(t.id) ?? [],
    });
    byDate.set(t.due_date, list);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, tks]) => ({ date, tasks: tks }));
}
