import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { TaskPriority } from '@/lib/database.types';

export interface TemplateTask {
  title: string;
  description: string;
  priority: TaskPriority;
  is_internal: boolean;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  tasks: TemplateTask[];
}

/** Lists the organization's project templates. RLS-scoped. */
export async function listProjectTemplates(): Promise<ProjectTemplate[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('project_templates')
    .select('id, name, tasks')
    .order('created_at', { ascending: false });
  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    tasks: t.tasks ?? [],
  }));
}
