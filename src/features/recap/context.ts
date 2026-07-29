import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { berlinToday } from '@/lib/time';

export interface RecapContext {
  companyName: string;
  weekFrom: string;
  today: string;
  completed: string[];
  ongoing: string[];
  hasActivity: boolean;
  contactEmail: string | null;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/**
 * Gathers a client's week for the recap: client-visible tasks completed in the
 * last 7 days and the ones still in progress (incl. ongoing/recurring work).
 * Service client (org-wide); callers verify agency access first.
 */
export async function gatherClientWeek(
  clientCompanyId: string,
): Promise<RecapContext> {
  const service = createSupabaseServiceClient();
  const today = berlinToday();
  const weekFromIso = daysAgoIso(7);

  const { data: company } = await service
    .from('client_companies')
    .select('name, contact_email')
    .eq('id', clientCompanyId)
    .maybeSingle();

  const { data: projects } = await service
    .from('projects')
    .select('id')
    .eq('client_company_id', clientCompanyId)
    .is('deleted_at', null);
  const projectIds = (projects ?? []).map((p) => p.id);

  const empty: RecapContext = {
    companyName: company?.name ?? '',
    weekFrom: weekFromIso.slice(0, 10),
    today,
    completed: [],
    ongoing: [],
    hasActivity: false,
    contactEmail: company?.contact_email ?? null,
  };
  if (projectIds.length === 0) return empty;

  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key');
  const keyByColumn = new Map(
    (columns ?? []).map((c) => [c.id, c.column_key] as const),
  );

  // Client-visible tasks only (mirrors what the client can see). Descriptions
  // are included so the AI can draw on details (SEO/SEA notes etc. the agency
  // captures as tasks) and write a fuller recap.
  const { data: tasks } = await service
    .from('tasks')
    .select('title, description, column_id, updated_at, is_internal')
    .in('project_id', projectIds)
    .eq('is_internal', false)
    .is('deleted_at', null)
    .limit(1000);

  const label = (t: { title: string; description: string | null }): string => {
    const desc = (t.description ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280);
    return desc ? `${t.title} – ${desc}` : t.title;
  };

  const completed: string[] = [];
  const ongoing: string[] = [];
  for (const t of tasks ?? []) {
    const key = keyByColumn.get(t.column_id);
    if (key === 'done') {
      if (t.updated_at >= weekFromIso && completed.length < 30) {
        completed.push(label(t));
      }
    } else if (ongoing.length < 30) {
      ongoing.push(label(t));
    }
  }

  return {
    ...empty,
    completed,
    ongoing,
    hasActivity: completed.length > 0 || ongoing.length > 0,
  };
}
