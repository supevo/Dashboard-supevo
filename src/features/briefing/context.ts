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

export interface BriefingSkill {
  name: string;
  level: number;
}

export interface BriefingContext {
  today: string;
  /** The employee's own active assigned tasks. */
  tasks: BriefingTask[];
  /** Unassigned tasks the employee could pick up (upcoming/overdue/queue). */
  available: BriefingTask[];
  /** The employee's self-reported skills (for matching available tasks). */
  skills: BriefingSkill[];
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
const SOON_WINDOW_DAYS = 7;
/** Cap on how many unassigned tasks to surface. */
const MAX_AVAILABLE = 12;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DUE_RANK = { overdue: 0, today: 1, soon: 2 } as const;
const PRIO_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function byUrgency(a: BriefingTask, b: BriefingTask): number {
  const da = a.dueState ? DUE_RANK[a.dueState] : 3;
  const db = b.dueState ? DUE_RANK[b.dueState] : 3;
  if (da !== db) return da - db;
  return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
}

/**
 * Gathers the calling employee's task situation for the morning briefing.
 * Uses the RLS-scoped server client, so it only ever sees tasks the user may
 * access. Returns the user's own active tasks, roll-up counts, and unassigned
 * tasks they could pick up (so upcoming deadlines surface even with an empty
 * personal queue).
 */
export async function gatherBriefingContext(
  userId: string,
): Promise<BriefingContext> {
  const supabase = await createSupabaseServerClient();
  const today = berlinToday();
  const soonCutoff = addDays(today, SOON_WINDOW_DAYS);

  // The employee's skills (best first). Missing table degrades to no skills.
  const { data: skillRows } = await supabase
    .from('employee_skills')
    .select('name, level')
    .eq('user_id', userId)
    .order('level', { ascending: false });
  const skills: BriefingSkill[] = (skillRows ?? []).map((s) => ({
    name: s.name,
    level: s.level,
  }));

  const empty: BriefingContext = {
    today,
    tasks: [],
    available: [],
    skills,
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

  const { data: columns } = await supabase
    .from('board_columns')
    .select('id, column_key');
  const keyByColumn = new Map(
    (columns ?? []).map((c) => [c.id, c.column_key] as const),
  );

  // All active, accessible tasks (RLS-scoped).
  const { data: taskRows } = await supabase
    .from('tasks')
    .select('id, title, project_id, priority, column_id, due_date, is_blocked')
    .eq('is_archived', false)
    .is('deleted_at', null)
    .limit(1000);
  if (!taskRows || taskRows.length === 0) return empty;

  const taskIds = taskRows.map((t) => t.id);

  // Assignments: which tasks are mine, and which are assigned to anyone.
  const { data: assignees } = await supabase
    .from('task_assignees')
    .select('task_id, user_id')
    .in('task_id', taskIds);
  const myTaskIds = new Set(
    (assignees ?? []).filter((a) => a.user_id === userId).map((a) => a.task_id),
  );
  const assignedTaskIds = new Set((assignees ?? []).map((a) => a.task_id));

  // Project + client names.
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
  const available: BriefingTask[] = [];

  for (const t of taskRows) {
    const columnKey = keyByColumn.get(t.column_id) ?? 'custom';
    if (columnKey === 'done') continue;

    let dueState: BriefingTask['dueState'] = null;
    if (t.due_date) {
      if (t.due_date < today) dueState = 'overdue';
      else if (t.due_date === today) dueState = 'today';
      else if (t.due_date <= soonCutoff) dueState = 'soon';
    }

    const project = projectById.get(t.project_id);
    const entry: BriefingTask = {
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
    };

    if (myTaskIds.has(t.id)) {
      counts.active++;
      if (columnKey === 'active') counts.inProgress++;
      if (columnKey === 'review') counts.review++;
      if (t.is_blocked) counts.blocked++;
      if (dueState === 'overdue') counts.overdue++;
      else if (dueState === 'today') counts.dueToday++;
      else if (dueState === 'soon') counts.dueSoon++;
      tasks.push(entry);
    } else if (!assignedTaskIds.has(t.id)) {
      // Unassigned: surface only if it needs attention (dated) or is queued.
      if (dueState || columnKey === 'queue') available.push(entry);
    }
  }

  tasks.sort(byUrgency);
  available.sort(byUrgency);

  return {
    today,
    tasks,
    available: available.slice(0, MAX_AVAILABLE),
    skills,
    counts,
  };
}
