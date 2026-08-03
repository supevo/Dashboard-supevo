import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';

export interface WeekWorkItem {
  id: string;
  title: string;
  myEmoji: string | null; // the current user's reaction, if any
}

export interface ClientWeekWork {
  completed: WeekWorkItem[];
  ongoing: WeekWorkItem[];
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/**
 * The client's "what we did for you this week": client-visible tasks completed
 * in the last 7 days plus what's currently in progress. RLS-scoped to the
 * logged-in client, so it only ever returns their own visible tasks. Completed
 * items carry the current user's reaction so the tile can render it.
 */
export async function getClientWeekWork(): Promise<ClientWeekWork> {
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  const empty: ClientWeekWork = { completed: [], ongoing: [] };
  if (!user) return empty;

  const weekFromIso = daysAgoIso(7);

  // Columns the client can see → map to their semantic key (queue/active/…/done).
  const { data: columns } = await supabase
    .from('board_columns')
    .select('id, column_key');
  const keyByColumn = new Map(
    (columns ?? []).map((c) => [c.id, c.column_key] as const),
  );

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, column_id, updated_at')
    .eq('is_internal', false)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(500);

  const completed: WeekWorkItem[] = [];
  const ongoing: WeekWorkItem[] = [];
  for (const t of tasks ?? []) {
    const key = keyByColumn.get(t.column_id);
    if (key === 'done') {
      if (t.updated_at >= weekFromIso && completed.length < 20) {
        completed.push({ id: t.id, title: t.title, myEmoji: null });
      }
    } else if (key === 'active' || key === 'review') {
      if (ongoing.length < 20) {
        ongoing.push({ id: t.id, title: t.title, myEmoji: null });
      }
    }
  }

  // Attach the current user's reactions to the completed items.
  if (completed.length > 0) {
    const { data: reactions } = await supabase
      .from('task_reactions')
      .select('task_id, emoji')
      .eq('user_id', user.id)
      .in('task_id', completed.map((c) => c.id));
    const byTask = new Map((reactions ?? []).map((r) => [r.task_id, r.emoji]));
    for (const c of completed) c.myEmoji = byTask.get(c.id) ?? null;
  }

  return { completed, ongoing };
}
