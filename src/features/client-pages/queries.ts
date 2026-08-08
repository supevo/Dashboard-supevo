import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ClientPageStatus } from './schema';

export interface LinkedTask {
  id: string;
  title: string;
  projectId: string;
}

export interface ClientPage {
  id: string;
  parentId: string | null;
  isFolder: boolean;
  title: string;
  content: string;
  status: ClientPageStatus;
  position: number;
  updatedAt: string;
  linkedTasks: LinkedTask[];
}

/**
 * Lists a client's internal pages/folders (team-only), each with its linked
 * tasks. Returns [] if the client_pages table is not present yet (migration
 * 0107 not applied); linked tasks degrade to [] if 0108 is not applied.
 */
export async function listClientPages(
  clientCompanyId: string,
): Promise<ClientPage[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('client_pages')
    .select('id, parent_id, is_folder, title, content, status, position, updated_at')
    .eq('client_company_id', clientCompanyId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return [];

  const rows = (data ?? []) as unknown as {
    id: string;
    parent_id: string | null;
    is_folder: boolean;
    title: string;
    content: string | null;
    status: ClientPageStatus;
    position: number;
    updated_at: string;
  }[];

  const linksByPage = await loadPageTaskLinks(
    supabase,
    rows.map((r) => r.id),
  );

  return rows.map((p) => ({
    id: p.id,
    parentId: p.parent_id,
    isFolder: p.is_folder,
    title: p.title,
    content: p.content ?? '',
    status: p.status,
    position: p.position,
    updatedAt: p.updated_at,
    linkedTasks: linksByPage.get(p.id) ?? [],
  }));
}

/** Loads page→task links for the given pages, resolved to task title/project. */
async function loadPageTaskLinks(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  pageIds: string[],
): Promise<Map<string, LinkedTask[]>> {
  const map = new Map<string, LinkedTask[]>();
  if (pageIds.length === 0) return map;

  const { data, error } = await supabase
    .from('client_page_tasks')
    .select('page_id, task_id')
    .in('page_id', pageIds);
  if (error || !data || data.length === 0) return map;

  // client_page_tasks is not in the generated Database types (migration 0108).
  const links = data as unknown as { page_id: string; task_id: string }[];

  const taskIds = [...new Set(links.map((l) => l.task_id))];
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, project_id')
    .in('id', taskIds);
  const taskById = new Map(
    (tasks ?? []).map((t) => [
      t.id,
      { id: t.id, title: t.title, projectId: t.project_id },
    ]),
  );

  for (const l of links) {
    const task = taskById.get(l.task_id);
    if (!task) continue;
    const list = map.get(l.page_id) ?? [];
    list.push(task);
    map.set(l.page_id, list);
  }
  return map;
}

/** Candidate tasks to link to a page: the client's active tasks. */
export async function listClientTaskOptions(
  clientCompanyId: string,
): Promise<LinkedTask[]> {
  const supabase = await createSupabaseServerClient();
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('client_company_id', clientCompanyId)
    .is('deleted_at', null);
  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length === 0) return [];

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, project_id')
    .in('project_id', projectIds)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);

  return (tasks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    projectId: t.project_id,
  }));
}
