import 'server-only';
import { cache } from 'react';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { livePresence } from '@/features/presence/status';

export type AccountManagerRole = 'primary' | 'secondary';

export interface AccountManager {
  userId: string;
  name: string;
  hasAvatar: boolean;
  status: string | null;
  email: string | null;
  phone: string | null;
  role: AccountManagerRole;
}

/** Loads a single agency profile as a client-facing AccountManager (low-
 *  sensitivity name/avatar/status only), or null if the profile is gone. */
async function loadManager(
  service: ReturnType<typeof createSupabaseServiceClient>,
  managerId: string,
  role: AccountManagerRole,
  fallbackName: string,
): Promise<AccountManager | null> {
  const { data: p } = await service
    .from('profiles')
    .select('id, full_name, avatar_url, status, last_seen_at, email, phone')
    .eq('id', managerId)
    .maybeSingle();
  if (!p) return null;
  return {
    userId: p.id,
    name: p.full_name ?? fallbackName,
    hasAvatar: Boolean(p.avatar_url),
    status: livePresence(p.status, p.last_seen_at),
    email: p.email ?? null,
    phone: p.phone ?? null,
    role,
  };
}

/**
 * The main + deputy account managers for the logged-in client. Read via the
 * service client because the client cannot see agency profiles through RLS;
 * only the low-sensitivity name/avatar/status is exposed.
 */
export const getMyAccountManagers = cache(async function getMyAccountManagers(): Promise<{
  primary: AccountManager | null;
  secondary: AccountManager | null;
}> {
  const company = await getMyClientCompany();
  if (!company) return { primary: null, secondary: null };

  const service = createSupabaseServiceClient();
  const { data: cc } = await service
    .from('client_companies')
    .select('account_manager_id, secondary_account_manager_id')
    .eq('id', company.clientCompanyId)
    .maybeSingle();
  if (!cc) return { primary: null, secondary: null };

  const primary = cc.account_manager_id
    ? await loadManager(service, cc.account_manager_id, 'primary', 'Ihr Ansprechpartner')
    : null;
  const secondary = cc.secondary_account_manager_id
    ? await loadManager(
        service,
        cc.secondary_account_manager_id,
        'secondary',
        'Ihre Vertretung',
      )
    : null;

  return { primary, secondary };
});

/** The main (primary) account manager only – used where a single name suffices. */
export async function getMyAccountManager(): Promise<AccountManager | null> {
  const { primary } = await getMyAccountManagers();
  return primary;
}
