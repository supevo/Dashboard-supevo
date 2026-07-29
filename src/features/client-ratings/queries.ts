import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export interface ClientTaskRating {
  stars: number;
  comment: string | null;
  ratedBy: string;
  raterName: string;
  createdAt: string;
}

/** Whether the task sits in a "done" column (rating is offered then). */
export async function isTaskDone(taskId: string): Promise<boolean> {
  const service = createSupabaseServiceClient();
  const { data: task } = await service
    .from('tasks')
    .select('column_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task?.column_id) return false;
  const { data: col } = await service
    .from('board_columns')
    .select('is_done_column')
    .eq('id', task.column_id)
    .maybeSingle();
  return Boolean(col?.is_done_column);
}

/** The current client user's own rating for a task (for the edit form). */
export async function getMyClientRating(
  taskId: string,
  userId: string,
): Promise<{ stars: number; comment: string | null } | null> {
  const { data } = await createSupabaseServiceClient()
    .from('client_task_ratings')
    .select('stars, comment')
    .eq('task_id', taskId)
    .eq('rated_by', userId)
    .maybeSingle();
  return data ? { stars: data.stars, comment: data.comment } : null;
}

/** The client rating shown to the agency on a task (most recent, with name). */
export async function getTaskClientRating(
  taskId: string,
): Promise<ClientTaskRating | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('client_task_ratings')
    .select('stars, comment, rated_by, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const { data: profile } = await service
    .from('profiles')
    .select('full_name')
    .eq('id', data.rated_by)
    .maybeSingle();

  return {
    stars: data.stars,
    comment: data.comment,
    ratedBy: data.rated_by,
    raterName: profile?.full_name ?? '—',
    createdAt: data.created_at,
  };
}
