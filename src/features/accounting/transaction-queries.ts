import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type BookkeepingTransaction =
  Database['public']['Tables']['bookkeeping_transactions']['Row'];
export type BookkeepingAccount =
  Database['public']['Tables']['bookkeeping_accounts']['Row'];

export interface PeriodFilter {
  year?: number;
  month?: number; // 0 or undefined = whole year (or all if no year)
}

/** [from, to] ISO date bounds for a year/month filter, or null for no filter. */
export function periodBounds(
  p: PeriodFilter,
): { from: string; to: string } | null {
  if (!p.year) return null;
  if (p.month && p.month >= 1 && p.month <= 12) {
    const mm = String(p.month).padStart(2, '0');
    const last = new Date(p.year, p.month, 0).getDate();
    return { from: `${p.year}-${mm}-01`, to: `${p.year}-${mm}-${last}` };
  }
  return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
}

/** Transactions of one company, newest first (optionally filtered by period). */
export async function listTransactions(
  billingEntityId: string,
  period: PeriodFilter = {},
  limit = 500,
): Promise<BookkeepingTransaction[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from('bookkeeping_transactions')
    .select('*')
    .eq('billing_entity_id', billingEntityId);
  const b = periodBounds(period);
  if (b) q = q.gte('datum', b.from).lte('datum', b.to);
  const { data } = await q
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
  period: PeriodFilter = {},
): Promise<{ count: number; inCents: number; outCents: number }> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from('bookkeeping_transactions')
    .select('betrag_cents')
    .eq('billing_entity_id', billingEntityId);
  const b = periodBounds(period);
  if (b) q = q.gte('datum', b.from).lte('datum', b.to);
  const { data } = await q.limit(10000);
  let inCents = 0;
  let outCents = 0;
  for (const t of data ?? []) {
    if (t.betrag_cents >= 0) inCents += t.betrag_cents;
    else outCents += t.betrag_cents;
  }
  return { count: data?.length ?? 0, inCents, outCents };
}
