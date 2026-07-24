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
