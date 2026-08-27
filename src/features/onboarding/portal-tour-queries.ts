import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Whether the signed-in client contact has already seen (or finished) the guided
 * portal tour. RLS scopes the read to the caller's own contact rows, so this
 * only reflects the current person. Returns true when ANY of their contact rows
 * carries the marker (a person may be a contact for several companies).
 */
export async function getMyPortalTourSeen(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_contacts')
    .select('portal_tour_seen_at');
  return (data ?? []).some((c) => c.portal_tour_seen_at != null);
}
