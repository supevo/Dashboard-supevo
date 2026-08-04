import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { livePresence } from '@/features/presence/status';

export interface AccountManager {
  userId: string;
  name: string;
  hasAvatar: boolean;
  status: string | null;
}

/**
 * The responsible account manager for the logged-in client, or null when none
 * is set. Read via the service client because the client cannot see agency
 * profiles through RLS; only the low-sensitivity name/avatar/status is exposed.
 */
export async function getMyAccountManager(): Promise<AccountManager | null> {
  const company = await getMyClientCompany();
  if (!company) return null;

  const service = createSupabaseServiceClient();
  const { data: cc } = await service
    .from('client_companies')
    .select('account_manager_id')
    .eq('id', company.clientCompanyId)
    .maybeSingle();
  if (!cc?.account_manager_id) return null;

  const { data: p } = await service
    .from('profiles')
    .select('id, full_name, avatar_url, status, last_seen_at')
    .eq('id', cc.account_manager_id)
    .maybeSingle();
  if (!p) return null;

  return {
    userId: p.id,
    name: p.full_name ?? 'Ihr Ansprechpartner',
    hasAvatar: Boolean(p.avatar_url),
    status: livePresence(p.status, p.last_seen_at),
  };
}
