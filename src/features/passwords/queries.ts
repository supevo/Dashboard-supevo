import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';

export interface PasswordEntry {
  id: string;
  title: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  category: string;
  hasSecret: boolean;
}

/**
 * Lists the agency org's password entries. Read via the service client and
 * explicitly scoped to the caller's agency org (authorization is the app-level
 * `hasAgencyAccess` check), so the shared vault works for every agency role –
 * including super_admin – regardless of the DB `is_agency_staff()` RLS helper.
 * The plaintext secret is never returned here — only whether one exists;
 * revealing decrypts on demand via a dedicated action.
 */
export async function listPasswordEntries(): Promise<PasswordEntry[]> {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) return [];
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return [];

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('password_entries')
    .select('id, title, username, url, notes, category, secret_encrypted')
    .eq('organization_id', orgId)
    .order('title', { ascending: true })
    .limit(1000);
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    username: r.username,
    url: r.url,
    notes: r.notes,
    category: r.category ?? 'Sonstiges',
    hasSecret: Boolean(r.secret_encrypted),
  }));
}
