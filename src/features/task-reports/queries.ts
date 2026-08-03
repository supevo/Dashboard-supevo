import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface TaskReport {
  id: string;
  taskTitle: string;
  message: string;
  createdAt: string;
  taskId: string | null;
}

/**
 * Individual task reports for the current client: the "task done" updates the
 * agency sent when a task was completed. Sourced from the client's own
 * notifications (RLS scopes to the recipient), newest first.
 */
export async function listMyTaskReports(limit = 100): Promise<TaskReport[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, entity_id, created_at')
    .eq('type', 'task_done')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((n) => ({
    id: n.id,
    taskTitle: n.title.replace(/^Erledigt:\s*/i, '').trim() || n.title,
    message: n.body ?? '',
    createdAt: n.created_at,
    taskId: n.entity_id,
  }));
}
