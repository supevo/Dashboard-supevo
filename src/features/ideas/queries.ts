import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface ClientIdea {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'queued';
  projectId: string | null;
  taskId: string | null;
  createdAt: string;
}

export interface IdeaProject {
  id: string;
  name: string;
}

/** The current client's ideas, newest first (RLS-scoped to their company). */
export async function listMyIdeas(): Promise<ClientIdea[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_ideas')
    .select('id, title, description, status, project_id, task_id, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status === 'queued' ? 'queued' : 'open',
    projectId: r.project_id,
    taskId: r.task_id,
    createdAt: r.created_at,
  }));
}

/** The client's projects, for choosing where an idea should land. */
export async function listMyIdeaProjects(): Promise<IdeaProject[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('projects')
    .select('id, name')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  return (data ?? []).map((p) => ({ id: p.id, name: p.name }));
}
