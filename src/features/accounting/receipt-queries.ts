import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type BookkeepingReceipt =
  Database['public']['Tables']['bookkeeping_receipts']['Row'];
export type BookkeepingImportLog =
  Database['public']['Tables']['bookkeeping_import_log']['Row'];

/** Receipts of one company, newest first (optionally filtered by kind). */
export async function listReceipts(
  billingEntityId: string,
  kind?: 'einnahme' | 'ausgabe',
  limit = 200,
): Promise<BookkeepingReceipt[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from('bookkeeping_receipts')
    .select('*')
    .eq('billing_entity_id', billingEntityId)
    .order('beleg_datum', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (kind) q = q.eq('kind', kind);
  const { data } = await q;
  return data ?? [];
}

/** Counts of receipts per kind for a company (for the tab badges/summary). */
export async function receiptCounts(
  billingEntityId: string,
): Promise<{ einnahme: number; ausgabe: number }> {
  const supabase = await createSupabaseServerClient();
  const [{ count: einnahme }, { count: ausgabe }] = await Promise.all([
    supabase
      .from('bookkeeping_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('billing_entity_id', billingEntityId)
      .eq('kind', 'einnahme'),
    supabase
      .from('bookkeeping_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('billing_entity_id', billingEntityId)
      .eq('kind', 'ausgabe'),
  ]);
  return { einnahme: einnahme ?? 0, ausgabe: ausgabe ?? 0 };
}

/** The most recent import runs for a company. */
export async function listImportLogs(
  billingEntityId: string,
  limit = 5,
): Promise<BookkeepingImportLog[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('bookkeeping_import_log')
    .select('*')
    .eq('billing_entity_id', billingEntityId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}
