import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { kategorie } from '@/features/accounting/categories';
import { getTaxOverview } from '@/features/accounting/tax/tax-queries';

export interface MonthlyNet {
  month: number;
  einnahmenCents: number;
  ausgabenCents: number;
}
export interface ExpenseGroup {
  label: string;
  cents: number;
}
export interface FinanceOverview {
  year: number;
  einnahmenNettoCents: number;
  ausgabenNettoCents: number;
  gewinnCents: number;
  ruecklageCents: number;
  ertragsteuerCents: number;
  ustZahllastCents: number;
  zahlungseingaenge: number;
  monthly: MonthlyNet[];
  expenseGroups: ExpenseGroup[];
  kleinunternehmer: boolean;
}

function nettoFromBrutto(bruttoCents: number, ustPct: number): number {
  if (ustPct <= 0) return bruttoCents;
  return Math.round(bruttoCents / (1 + ustPct / 100));
}

/**
 * Overview KPIs + a monthly net income/expense series + the largest expense
 * groups (by EÜR group) for one company/year. Reuses the tax computation for the
 * headline figures and the rest is derived from the year's transactions.
 */
export async function getFinanceOverview(
  billingEntityId: string,
  year: number,
): Promise<FinanceOverview> {
  const tax = await getTaxOverview(billingEntityId, year);

  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from('bookkeeping_transactions')
    .select('datum, betrag_cents, kategorie_id, privatanteil')
    .eq('billing_entity_id', billingEntityId)
    .gte('datum', `${year}-01-01`)
    .lte('datum', `${year}-12-31`)
    .limit(20000);

  const monthly: MonthlyNet[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    einnahmenCents: 0,
    ausgabenCents: 0,
  }));
  const groupTotals = new Map<string, number>();
  let zahlungseingaenge = 0;

  for (const t of rows ?? []) {
    const kat = kategorie(t.kategorie_id);
    if (!kat || kat.art === 'privat' || kat.art === 'neutral') continue;
    const m = Number(t.datum.slice(5, 7));
    if (m < 1 || m > 12) continue;
    const brutto = Math.abs(t.betrag_cents);
    const netto = nettoFromBrutto(brutto, kat.ust);
    const factor = 1 - Math.min(100, Math.max(0, t.privatanteil ?? 0)) / 100;

    if (kat.art === 'einnahme') {
      monthly[m - 1]!.einnahmenCents += Math.round(netto * factor);
      if (t.betrag_cents > 0) zahlungseingaenge += 1;
    } else if (kat.art === 'ausgabe') {
      const quote = kat.quote ?? 1;
      const val = Math.round(netto * factor * quote);
      monthly[m - 1]!.ausgabenCents += val;
      groupTotals.set(kat.euer, (groupTotals.get(kat.euer) ?? 0) + val);
    }
  }

  const expenseGroups: ExpenseGroup[] = [...groupTotals.entries()]
    .map(([label, cents]) => ({ label, cents }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 5);

  return {
    year,
    einnahmenNettoCents: tax.euer.einnahmenNettoCents,
    ausgabenNettoCents: tax.euer.ausgabenNettoCents,
    gewinnCents: tax.euer.gewinnCents,
    ruecklageCents: tax.estimate.ruecklageCents,
    ertragsteuerCents: tax.estimate.ertragsteuerCents,
    ustZahllastCents: tax.ust.zahllastCents,
    zahlungseingaenge,
    monthly,
    expenseGroups,
    kleinunternehmer: tax.kleinunternehmer,
  };
}
