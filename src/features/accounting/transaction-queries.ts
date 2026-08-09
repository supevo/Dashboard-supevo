import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type BookkeepingTransaction =
  Database['public']['Tables']['bookkeeping_transactions']['Row'];
export type BookkeepingAccount =
  Database['public']['Tables']['bookkeeping_accounts']['Row'];

/** Transactions of one company, newest first. */
export async function listTransactions(
  billingEntityId: string,
  limit = 300,
): Promise<BookkeepingTransaction[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('bookkeeping_transactions')
    .select('*')
    .eq('billing_entity_id', billingEntityId)
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Bank accounts of one company. */
export async function listBankAccounts(
  billingEntityId: string,
): Promise<BookkeepingAccount[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('bookkeeping_accounts')
    .select('*')
    .eq('billing_entity_id', billingEntityId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

/** Count + summed in/out of a company's transactions (for the tab header). */
export async function transactionSummary(
  billingEntityId: string,
): Promise<{ count: number; inCents: number; outCents: number }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('bookkeeping_transactions')
    .select('betrag_cents')
    .eq('billing_entity_id', billingEntityId)
    .limit(10000);
  let inCents = 0;
  let outCents = 0;
  for (const t of data ?? []) {
    if (t.betrag_cents >= 0) inCents += t.betrag_cents;
    else outCents += t.betrag_cents;
  }
  return { count: data?.length ?? 0, inCents, outCents };
}
