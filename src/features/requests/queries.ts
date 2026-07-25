import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import type { TaskSuggestion } from './suggest';

export interface ClientRequest {
  id: string;
  projectId: string;
  projectName: string;
  submitterName: string;
  body: string;
  suggestions: TaskSuggestion[];
  status: 'new' | 'processed' | 'dismissed';
  createdAt: string;
}

/** Lists a client company's briefings/requests for the agency. RLS-scoped. */
export async function listClientRequests(
  clientCompanyId: string,
): Promise<ClientRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_requests')
    .select(
      'id, project_id, submitted_by, body, suggestions, status, created_at',
    )
    .eq('client_company_id', clientCompanyId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (!data || data.length === 0) return [];

  const projectIds = [...new Set(data.map((r) => r.project_id))];
  const submitterIds = [
    ...new Set(data.map((r) => r.submitted_by).filter((v): v is string => !!v)),
  ];
  const service = createSupabaseServiceClient();
  const [{ data: projects }, { data: profiles }] = await Promise.all([
    supabase.from('projects').select('id, name').in('id', projectIds),
    submitterIds.length
      ? service.from('profiles').select('id, full_name').in('id', submitterIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? '—'] as const),
  );

  return data.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    projectName: projectName.get(r.project_id) ?? '—',
    submitterName: r.submitted_by ? (nameById.get(r.submitted_by) ?? '—') : '—',
    body: r.body,
    suggestions: r.suggestions ?? [],
    status: r.status,
    createdAt: r.created_at,
  }));
}
