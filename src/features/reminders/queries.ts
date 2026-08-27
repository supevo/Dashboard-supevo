import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface Reminder {
  id: string;
  text: string;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
}

function map(r: {
  id: string;
  text: string;
  due_at: string | null;
  done_at: string | null;
  created_at: string;
}): Reminder {
  return {
    id: r.id,
    text: r.text,
    dueAt: r.due_at,
    doneAt: r.done_at,
    createdAt: r.created_at,
  };
}

/**
 * The current user's reminders/to-dos. Returns all open ones plus recently
 * completed ones (last 7 days), open first, soonest due first. RLS scopes to
 * the caller.
 */
export async function listMyReminders(): Promise<{
  open: Reminder[];
  done: Reminder[];
}> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('personal_reminders')
    .select('id, text, due_at, done_at, created_at')
    .or(`done_at.is.null,done_at.gte.${since}`)
    .order('created_at', { ascending: false })
    .limit(200);

  const all = (data ?? []).map(map);
  const open = all
    .filter((r) => !r.doneAt)
    .sort((a, b) => {
      // Mit Termin zuerst (nächster Termin oben), dann Termin-lose.
      if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  const done = all
    .filter((r) => r.doneAt)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  return { open, done };
}
