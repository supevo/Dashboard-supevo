import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { berlinToday } from '@/lib/time';

export type HealthLevel = 'green' | 'yellow' | 'red' | 'idle';

export interface ClientHealth {
  level: HealthLevel;
  completed: number; // client tasks completed this month
  overdue: number; // open tasks past due
  open: number; // open tasks total
}

function levelFor(completed: number, overdue: number, open: number): HealthLevel {
  if (open === 0 && completed === 0) return 'idle';
  if (overdue >= 3 || (completed === 0 && open > 0)) return 'red';
  if (completed >= 3 && overdue === 0) return 'green';
  return 'yellow';
}

/**
 * Computes a simple monthly "health" traffic light per client company:
 * green = viel erledigt & nichts überfällig, red = nichts erledigt trotz
 * offener Aufgaben oder viel Überfälliges, yellow = dazwischen. Internal only.
 */
export async function getClientHealthMap(
  orgId: string,
): Promise<Map<string, ClientHealth>> {
  const supabase = await createSupabaseServerClient();
  const today = berlinToday();
  const monthStart = `${today.slice(0, 7)}-01`;

  const { data: projects } = await supabase
    .from('projects')
    .select('id, client_company_id')
    .eq('organization_id', orgId)
    .is('deleted_at', null);
  const companyByProject = new Map(
    (projects ?? []).map((p) => [p.id, p.client_company_id] as const),
  );
  const projectIds = [...companyByProject.keys()];

  const result = new Map<string, ClientHealth>();
  if (projectIds.length === 0) return result;

  const { data: columns } = await supabase
    .from('board_columns')
    .select('id, column_key');
  const doneCols = new Set(
    (columns ?? []).filter((c) => c.column_key === 'done').map((c) => c.id),
  );

  const { data: tasks } = await supabase
    .from('tasks')
    .select('project_id, column_id, due_date, updated_at, is_archived, deleted_at')
    .in('project_id', projectIds)
    .is('deleted_at', null)
    .eq('is_archived', false)
    .limit(5000);

  const agg = new Map<string, { completed: number; overdue: number; open: number }>();
  const bump = (company: string) => {
    let a = agg.get(company);
    if (!a) {
      a = { completed: 0, overdue: 0, open: 0 };
      agg.set(company, a);
    }
    return a;
  };

  for (const t of tasks ?? []) {
    const company = companyByProject.get(t.project_id);
    if (!company) continue;
    const a = bump(company);
    const isDone = doneCols.has(t.column_id);
    if (isDone) {
      if (t.updated_at >= `${monthStart}T00:00:00`) a.completed++;
    } else {
      a.open++;
      if (t.due_date && t.due_date < today) a.overdue++;
    }
  }

  for (const [company, a] of agg) {
    result.set(company, {
      ...a,
      level: levelFor(a.completed, a.overdue, a.open),
    });
  }
  return result;
}
