import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface ReportRow {
  key: string;
  label: string;
  minutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
}

export interface TimeReport {
  byProject: ReportRow[];
  byClient: ReportRow[];
  byMember: ReportRow[];
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
}

/** Aggregated time report for an organization since `sinceIso`. RLS limits the
 *  underlying time entries to what the viewer may see. */
export async function getTimeReport(sinceIso: string): Promise<TimeReport> {
  const supabase = await createSupabaseServerClient();
  const { data: entries } = await supabase
    .from('time_entries')
    .select(
      'project_id, client_company_id, user_id, duration_minutes, is_billable',
    )
    .gte('started_at', sinceIso)
    .not('ended_at', 'is', null);

  const rows = entries ?? [];

  // Resolve display names.
  const projectIds = [...new Set(rows.map((r) => r.project_id))];
  const clientIds = [...new Set(rows.map((r) => r.client_company_id))];
  const userIds = [...new Set(rows.map((r) => r.user_id))];

  const [{ data: projects }, { data: clients }, { data: profiles }] =
    await Promise.all([
      supabase.from('projects').select('id, name').in('id', projectIds.length ? projectIds : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('client_companies').select('id, name').in('id', clientIds.length ? clientIds : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('profiles').select('id, full_name').in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']),
    ]);

  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const memberName = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? '—']),
  );

  function aggregate(
    keyOf: (r: (typeof rows)[number]) => string,
    labelOf: (k: string) => string,
  ): ReportRow[] {
    const map = new Map<string, ReportRow>();
    for (const r of rows) {
      const k = keyOf(r);
      const cur =
        map.get(k) ??
        { key: k, label: labelOf(k), minutes: 0, billableMinutes: 0, nonBillableMinutes: 0 };
      const m = r.duration_minutes ?? 0;
      cur.minutes += m;
      if (r.is_billable) cur.billableMinutes += m;
      else cur.nonBillableMinutes += m;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }

  let billable = 0;
  let nonBillable = 0;
  for (const r of rows) {
    const m = r.duration_minutes ?? 0;
    if (r.is_billable) billable += m;
    else nonBillable += m;
  }

  return {
    byProject: aggregate((r) => r.project_id, (k) => projectName.get(k) ?? '—'),
    byClient: aggregate((r) => r.client_company_id, (k) => clientName.get(k) ?? '—'),
    byMember: aggregate((r) => r.user_id, (k) => memberName.get(k) ?? '—'),
    totalMinutes: billable + nonBillable,
    billableMinutes: billable,
    nonBillableMinutes: nonBillable,
  };
}
