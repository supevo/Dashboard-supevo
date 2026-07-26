'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';

/** Returns the current user's iCal feed token, creating one on first use. */
export async function getOrCreateFeedToken(): Promise<string | null> {
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return null;
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return null;

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from('calendar_feed_tokens')
    .select('token')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing?.token) return existing.token;

  const { data: created } = await supabase
    .from('calendar_feed_tokens')
    .insert({ user_id: user.id, organization_id: orgId })
    .select('token')
    .single();
  return created?.token ?? null;
}

/** Regenerates the token (invalidates the old subscription URL). */
export async function regenerateFeedToken(): Promise<string | null> {
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return null;
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return null;

  const supabase = await createSupabaseServerClient();
  // Delete + re-insert so the DB default mints a fresh token.
  await supabase.from('calendar_feed_tokens').delete().eq('user_id', user.id);
  const { data: created } = await supabase
    .from('calendar_feed_tokens')
    .insert({ user_id: user.id, organization_id: orgId })
    .select('token')
    .single();
  return created?.token ?? null;
}
