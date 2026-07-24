import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type InvoiceRow = Database['public']['Tables']['invoices']['Row'];

/** Lists invoices for a client (newest first). RLS scopes visibility. */
export async function listClientInvoices(
  clientCompanyId: string,
): Promise<InvoiceRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('invoices')
    .select('*')
    .eq('client_company_id', clientCompanyId)
    .order('created_at', { ascending: false })
    .limit(60);
  return data ?? [];
}

/**
 * Lists the signed-in client's own (non-draft) invoices. RLS already limits a
 * client to their company's non-draft invoices, so no explicit filter needed.
 */
export async function listPortalInvoices(): Promise<InvoiceRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('invoices')
    .select('*')
    .neq('status', 'draft')
    .order('issue_date', { ascending: false })
    .limit(120);
  return data ?? [];
}
