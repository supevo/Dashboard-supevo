import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The logged-in client's own „per-task notifications" preference. RLS-scoped to
 * their own client_contacts row. Defaults to true (opted in) when unknown.
 */
export async function getMyTaskNotifyPref(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_contacts')
    .select('notify_task_updates')
    .limit(1)
    .maybeSingle();
  return data?.notify_task_updates ?? true;
}
