import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
 * Lists the org's password entries (RLS-scoped to agency staff). The plaintext
 * secret is never returned here — only whether one exists; revealing decrypts on
 * demand via a dedicated action.
 */
export async function listPasswordEntries(): Promise<PasswordEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('password_entries')
    .select('id, title, username, url, notes, category, secret_encrypted')
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
