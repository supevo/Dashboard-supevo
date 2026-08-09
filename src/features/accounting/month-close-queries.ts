import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { kategorie, kategorieLabel } from '@/features/accounting/categories';
import { getReconcileSuggestions } from '@/features/accounting/reconcile-queries';

export interface MonthStat {
  month: number; // 1..12
  total: number;
  belegt: number;
  hasData: boolean;
}

export interface BookingGap {
  id: string;
  datum: string;
  gegen: string | null;
  zweck: string | null;
  betragCents: number;
  kategorieLabel: string;
}

export interface MonthClose {
  year: number;
  selected: number;
  months: MonthStat[];
  step1Count: number;
  step2Uncategorized: number;
  step3Gaps: BookingGap[];
  step4OpenPayments: number;
  intentionalNoReceipt: BookingGap[];
}

interface TxRow {
  id: string;
  datum: string;
  gegen: string | null;
  zweck: string | null;
  betrag_cents: number;
  kategorie_id: string | null;
  beleg_id: string | null;
  beleg_nicht_noetig: boolean;
}

/** A business expense that isn't a Dauerbeleg needs a receipt on file. */
function needsReceipt(tx: TxRow): boolean {
  if (tx.beleg_nicht_noetig) return false;
  const kat = kategorie(tx.kategorie_id);
  if (!kat || kat.art !== 'ausgabe') return false;
  return !kat.dauerbeleg;
}

function monthOf(datum: string): number {
  // datum is YYYY-MM-DD
  return Number(datum.slice(5, 7));
}

function toGap(tx: TxRow): BookingGap {
  return {
    id: tx.id,
    datum: tx.datum,
    gegen: tx.gegen,
    zweck: tx.zweck,
    betragCents: tx.betrag_cents,
    kategorieLabel: kategorieLabel(tx.kategorie_id),
  };
}

/**
 * Builds the month-close overview for a company/year: per-month progress
 * (bookings that have – or don't need – a receipt) plus the four-step checklist
 * and the receipt gaps for the selected month.
 */
export async function getMonthClose(
  billingEntityId: string,
  year: number,
  selectedMonth: number,
): Promise<MonthClose> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('bookkeeping_transactions')
    .select(
      'id, datum, gegen, zweck, betrag_cents, kategorie_id, beleg_id, beleg_nicht_noetig',
    )
    .eq('billing_entity_id', billingEntityId)
    .gte('datum', `${year}-01-01`)
    .lte('datum', `${year}-12-31`)
    .limit(20000);
  const rows = (data ?? []) as TxRow[];

  const months: MonthStat[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    total: 0,
    belegt: 0,
    hasData: false,
  }));
  for (const tx of rows) {
    const m = monthOf(tx.datum);
    if (m < 1 || m > 12) continue;
    const stat = months[m - 1]!;
    stat.total += 1;
    stat.hasData = true;
    const belegt = !needsReceipt(tx) || tx.beleg_id != null;
    if (belegt) stat.belegt += 1;
  }

  const inMonth = rows.filter((t) => monthOf(t.datum) === selectedMonth);
  const step2Uncategorized = inMonth.filter((t) => !t.kategorie_id).length;
  const step3Gaps = inMonth
    .filter((t) => needsReceipt(t) && t.beleg_id == null)
    .map(toGap);
  const intentionalNoReceipt = inMonth
    .filter((t) => t.beleg_nicht_noetig)
    .map(toGap);

  // Step 4: open payment suggestions whose transaction falls in the month.
  const { payments } = await getReconcileSuggestions(billingEntityId);
  const monthTxIds = new Set(inMonth.map((t) => t.id));
  const step4OpenPayments = payments.filter((p) =>
    monthTxIds.has(p.match.leftId),
  ).length;

  return {
    year,
    selected: selectedMonth,
    months,
    step1Count: inMonth.length,
    step2Uncategorized,
    step3Gaps,
    step4OpenPayments,
    intentionalNoReceipt,
  };
}
