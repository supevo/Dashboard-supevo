import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { berlinToday } from '@/lib/time';
import type { ColumnKey, TaskPriority } from '@/lib/database.types';

export interface BriefingTask {
  title: string;
  projectName: string;
  clientName: string | null;
  priority: TaskPriority;
  columnKey: ColumnKey;
  dueDate: string | null;
  isBlocked: boolean;
  /** 'overdue' | 'today' | 'soon' | null relative to Berlin today. */
  dueState: 'overdue' | 'today' | 'soon' | null;
}

export interface BriefingContext {
  today: string;
  tasks: BriefingTask[];
  counts: {
    active: number;
    inProgress: number;
    review: number;
    blocked: number;
    overdue: number;
    dueToday: number;
    dueSoon: number;
  };
}

/** Days ahead (inclusive) that still count as "soon" for the briefing. */
const SOON_WINDOW_DAYS = 3;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Gathers the calling employee's task situation for the morning briefing.
 * Uses the RLS-scoped server client, so it only ever sees tasks the user may
 * access. Returns the user's active assigned tasks plus roll-up counts.
 */
export async function gatherBriefingContext(
  userId: string,
): Promise<BriefingContext> {
  const supabase = await createSupabaseServerClient();
  const today = berlinToday();
  const soonCutoff = addDays(today, SOON_WINDOW_DAYS);

  const { data: columns } = await supabase
    .from('board_columns')
    .select('id, column_key');
  const keyByColumn = new Map(
    (columns ?? []).map((c) => [c.id, c.column_key] as const),
  );

  const { data: mine } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('user_id', userId);
  const myTaskIds = [...new Set((mine ?? []).map((m) => m.task_id))];

  const empty: BriefingContext = {
    today,
    tasks: [],
    counts: {
      active: 0,
      inProgress: 0,
      review: 0,
      blocked: 0,
      overdue: 0,
      dueToday: 0,
      dueSoon: 0,
    },
  };
  if (myTaskIds.length === 0) return empty;

  const { data: taskRows } = await supabase
    .from('tasks')
    .select('id, title, project_id, priority, column_id, due_date, is_blocked')
    .in('id', myTaskIds)
    .eq('is_archived', false)
    .is('deleted_at', null);
  if (!taskRows || taskRows.length === 0) return empty;

  // Project + client names for context.
  const projectIds = [...new Set(taskRows.map((t) => t.project_id))];
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, client_company_id')
    .in('id', projectIds);
  const projectById = new Map((projects ?? []).map((p) => [p.id, p] as const));

  const clientIds = [
    ...new Set((projects ?? []).map((p) => p.client_company_id)),
  ];
  const { data: clients } = clientIds.length
    ? await supabase
        .from('client_companies')
        .select('id, name')
        .in('id', clientIds)
    : { data: [] };
  const clientNameById = new Map(
    (clients ?? []).map((c) => [c.id, c.name] as const),
  );

  const counts = { ...empty.counts };
  const tasks: BriefingTask[] = [];

  for (const t of taskRows) {
    const columnKey = keyByColumn.get(t.column_id) ?? 'custom';
    if (columnKey === 'done') continue; // finished — leave it out

    counts.active++;
    if (columnKey === 'active') counts.inProgress++;
    if (columnKey === 'review') counts.review++;
    if (t.is_blocked) counts.blocked++;

    let dueState: BriefingTask['dueState'] = null;
    if (t.due_date) {
      if (t.due_date < today) {
        dueState = 'overdue';
        counts.overdue++;
      } else if (t.due_date === today) {
        dueState = 'today';
        counts.dueToday++;
      } else if (t.due_date <= soonCutoff) {
        dueState = 'soon';
        counts.dueSoon++;
      }
    }

    const project = projectById.get(t.project_id);
    tasks.push({
      title: t.title,
      projectName: project?.name ?? '—',
      clientName: project
        ? (clientNameById.get(project.client_company_id) ?? null)
        : null,
      priority: t.priority,
      columnKey,
      dueDate: t.due_date,
      isBlocked: t.is_blocked,
      dueState,
    });
  }

  // Most urgent first: overdue → today → soon → undated; then by priority.
  const dueRank = { overdue: 0, today: 1, soon: 2 } as const;
  const prioRank: Record<TaskPriority, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  tasks.sort((a, b) => {
    const da = a.dueState ? dueRank[a.dueState] : 3;
    const db = b.dueState ? dueRank[b.dueState] : 3;
    if (da !== db) return da - db;
    return prioRank[a.priority] - prioRank[b.priority];
  });

  return { today, tasks, counts };
}
