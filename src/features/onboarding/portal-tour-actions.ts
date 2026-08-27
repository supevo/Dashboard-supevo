'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { hasClientAccess } from '@/features/auth/access';
import { type ActionResult, errorResult, successResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';

/**
 * Marks the guided portal tour as seen for the current client contact, so it
 * won't auto-start again. Writes only the caller's own contact rows (ids read
 * via RLS), mirroring setMyTaskNotifyPrefAction.
 */
export async function markPortalTourSeenAction(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !hasClientAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { data: contacts } = await supabase.from('client_contacts').select('id');
  const ids = (contacts ?? []).map((c) => c.id);
  if (ids.length === 0) return successResult();

  await createSupabaseServiceClient()
    .from('client_contacts')
    .update({ portal_tour_seen_at: new Date().toISOString() })
    .in('id', ids);
  return successResult();
}
