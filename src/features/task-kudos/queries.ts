import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface TaskKudosInfo {
  completed: boolean;
  completedAt: string | null;
  completerId: string | null;
  completerName: string | null;
  isCompleter: boolean;
  myGiven: boolean;
  raterCount: number;
  totalPoints: number;
}

/** Kudos state for a task: who completed it, whether the viewer already rated. */
export async function getTaskKudos(
  taskId: string,
  userId: string,
): Promise<TaskKudosInfo> {
  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('completed_by, completed_at')
    .eq('id', taskId)
    .maybeSingle();

  const empty: TaskKudosInfo = {
    completed: false,
    completedAt: null,
    completerId: null,
    completerName: null,
    isCompleter: false,
    myGiven: false,
    raterCount: 0,
    totalPoints: 0,
  };
  if (!task || !task.completed_at || !task.completed_by) return empty;

  const { data: completer } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', task.completed_by)
    .maybeSingle();

  const { data: kudos } = await supabase
    .from('kudos')
    .select('from_user_id, points')
    .eq('task_id', taskId);
  const rows = kudos ?? [];

  return {
    completed: true,
    completedAt: task.completed_at,
    completerId: task.completed_by,
    completerName: completer?.full_name ?? 'Unbekannt',
    isCompleter: task.completed_by === userId,
    myGiven: rows.some((k) => k.from_user_id === userId),
    raterCount: rows.length,
    totalPoints: rows.reduce((s, k) => s + (k.points ?? 0), 0),
  };
}
