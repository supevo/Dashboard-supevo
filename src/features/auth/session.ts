import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CurrentUser } from './access';

export type { CurrentUser, MembershipInfo } from './access';
export {
  hasAgencyAccess,
  hasClientAccess,
  landingPathFor,
  primaryAgencyOrgId,
  primaryClientOrgId,
} from './access';

/**
 * Loads the authenticated user together with their active memberships.
 * Returns null when there is no valid session.
 *
 * Cached per request so layouts and pages can call it without extra queries.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from('memberships')
    .select('organization_id, role, status')
    .eq('user_id', user.id)
    .eq('status', 'active');

  return {
    id: user.id,
    email: user.email ?? '',
    fullName: profile?.full_name ?? null,
    memberships: (memberships ?? []).map((m) => ({
      organizationId: m.organization_id,
      role: m.role,
      status: m.status,
    })),
  };
});
