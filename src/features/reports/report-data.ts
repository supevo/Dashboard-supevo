import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface ClientMonthReport {
  companyName: string;
  monthLabel: string;
  completed: { title: string; projectName: string; date: string }[];
  timeByProject: { projectName: string; minutes: number }[];
  totalMinutes: number;
}

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** Builds a client's monthly report data. Service client; agency-checked by caller. */
export async function gatherClientMonth(
  clientCompanyId: string,
  year: number,
  month: number, // 1-12
): Promise<ClientMonthReport> {
  const service = createSupabaseServiceClient();
  const startIso = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const endIso = new Date(Date.UTC(year, month, 1)).toISOString();
  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  const { data: company } = await service
    .from('client_companies')
    .select('name')
    .eq('id', clientCompanyId)
    .maybeSingle();

  const { data: projects } = await service
    .from('projects')
    .select('id, name')
    .eq('client_company_id', clientCompanyId);
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const projectIds = (projects ?? []).map((p) => p.id);

  const base: ClientMonthReport = {
    companyName: company?.name ?? '',
    monthLabel,
    completed: [],
    timeByProject: [],
    totalMinutes: 0,
  };
  if (projectIds.length === 0) return base;

  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key');
  const doneColumns = new Set(
    (columns ?? []).filter((c) => c.column_key === 'done').map((c) => c.id),
  );

  // Tasks completed (in a done column, updated) during the month.
  const { data: tasks } = await service
    .from('tasks')
    .select('title, project_id, column_id, updated_at')
    .in('project_id', projectIds)
    .is('deleted_at', null)
    .gte('updated_at', startIso)
    .lt('updated_at', endIso)
    .limit(500);
  const completed = (tasks ?? [])
    .filter((t) => doneColumns.has(t.column_id))
    .map((t) => ({
      title: t.title,
      projectName: projectName.get(t.project_id) ?? '—',
      date: t.updated_at.slice(0, 10),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Time logged during the month.
  const { data: entries } = await service
    .from('time_entries')
    .select('project_id, duration_minutes, started_at')
    .eq('client_company_id', clientCompanyId)
    .gte('started_at', startIso)
    .lt('started_at', endIso)
    .limit(5000);
  const byProject = new Map<string, number>();
  let totalMinutes = 0;
  for (const e of entries ?? []) {
    const min = e.duration_minutes ?? 0;
    if (min <= 0) continue;
    totalMinutes += min;
    byProject.set(e.project_id, (byProject.get(e.project_id) ?? 0) + min);
  }
  const timeByProject = [...byProject.entries()]
    .map(([pid, minutes]) => ({
      projectName: projectName.get(pid) ?? '—',
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return { ...base, completed, timeByProject, totalMinutes };
}
