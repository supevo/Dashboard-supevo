import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type HealthLevel = 'green' | 'yellow' | 'red' | 'over' | 'idle';

export interface ClientHealth {
  level: HealthLevel;
  /** Estimated minutes of work completed for this client in the window. */
  minutes: number;
  /** Actual share of total completed work across all clients (0..1). */
  share: number;
  /** Expected share from the attention factor (0..1). */
  expected: number;
  /** actual ÷ expected — the fairness balance. */
  balance: number;
}

// Fair-share health: a client is "green" when it received roughly its fair
// share of the team's attention (relative to all clients, weighted by each
// client's attention factor), "red" when clearly under-served (→ nurture) and
// "over" when it pulled far more than its share (→ rein in the demander).
const WINDOW_DAYS = 30;
const DEFAULT_ESTIMATE_MIN = 30; // fallback when no estimates exist at all
const RED_BELOW = 0.6;
const OVER_ABOVE = 1.5;

function median(values: number[]): number {
  if (values.length === 0) return DEFAULT_ESTIMATE_MIN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function levelForBalance(balance: number): HealthLevel {
  if (balance < RED_BELOW) return 'red';
  if (balance > OVER_ABOVE) return 'over';
  return 'green';
}

/**
 * Fair-share traffic light per client company: estimated minutes of work
 * completed in the last 30 days vs. the client's entitled share (attention
 * factor ÷ sum of factors). Internal only — never exposed to clients.
 */
export async function getClientHealthMap(
  orgId: string,
): Promise<Map<string, ClientHealth>> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  // Active clients + their attention factor form the fair-share pool.
  // '*' so the not-yet-typed attention_factor column (migration 0110) is
  // present at runtime; read it via a cast.
  const { data: companies } = await supabase
    .from('client_companies')
    .select('*')
    .eq('organization_id', orgId)
    .is('deleted_at', null);
  const factorByCompany = new Map(
    (companies ?? [])
      // Legacy clients are not part of the fair-share traffic light: they run on
      // a fixed legacy package, so they neither get a health level nor dilute
      // the active clients' shares.
      .filter((c) => c.is_active && !c.is_legacy)
      .map(
        (c) =>
          [
            c.id,
            Number((c as { attention_factor?: number }).attention_factor ?? 1) ||
              0,
          ] as const,
      ),
  );

  const result = new Map<string, ClientHealth>();
  if (factorByCompany.size === 0) return result;

  const { data: projects } = await supabase
    .from('projects')
    .select('id, client_company_id')
    .eq('organization_id', orgId)
    .is('deleted_at', null);
  const companyByProject = new Map(
    (projects ?? [])
      .filter((p) => factorByCompany.has(p.client_company_id))
      .map((p) => [p.id, p.client_company_id] as const),
  );
  const projectIds = [...companyByProject.keys()];

  const { data: columns } = await supabase
    .from('board_columns')
    .select('id, column_key');
  const doneCols = new Set(
    (columns ?? []).filter((c) => c.column_key === 'done').map((c) => c.id),
  );

  const { data: tasks } = projectIds.length
    ? await supabase
        .from('tasks')
        .select('project_id, column_id, estimated_minutes, updated_at')
        .in('project_id', projectIds)
        .is('deleted_at', null)
        .eq('is_archived', false)
        .gte('updated_at', since)
        .limit(5000)
    : { data: [] };

  const completed = (tasks ?? []).filter((t) => doneCols.has(t.column_id));
  const med = median(
    completed
      .map((t) => t.estimated_minutes)
      .filter((m): m is number => typeof m === 'number' && m > 0),
  );

  const minutesByCompany = new Map<string, number>();
  for (const t of completed) {
    const company = companyByProject.get(t.project_id);
    if (!company) continue;
    const est =
      typeof t.estimated_minutes === 'number' && t.estimated_minutes > 0
        ? t.estimated_minutes
        : med;
    minutesByCompany.set(company, (minutesByCompany.get(company) ?? 0) + est);
  }

  const totalMinutes = [...minutesByCompany.values()].reduce((a, b) => a + b, 0);
  const totalFactor = [...factorByCompany.values()].reduce((a, b) => a + b, 0);

  for (const [companyId, factor] of factorByCompany) {
    const minutes = minutesByCompany.get(companyId) ?? 0;
    const share = totalMinutes > 0 ? minutes / totalMinutes : 0;
    const expected = totalFactor > 0 ? factor / totalFactor : 0;
    if (totalMinutes === 0) {
      result.set(companyId, { level: 'idle', minutes, share, expected, balance: 0 });
      continue;
    }
    const balance = expected > 0 ? share / expected : share > 0 ? 99 : 0;
    result.set(companyId, {
      level: levelForBalance(balance),
      minutes,
      share,
      expected,
      balance,
    });
  }
  return result;
}
