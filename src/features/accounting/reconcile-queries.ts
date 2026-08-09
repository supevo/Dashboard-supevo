import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  matchPaymentsToInvoices,
  matchReceiptsToTransactions,
  type Match,
  type TxLite,
  type InvoiceLite,
  type ReceiptLite,
} from '@/features/accounting/reconcile';

export interface PaymentSuggestion {
  match: Match;
  txDatum: string;
  txGegen: string | null;
  txBetragCents: number;
  invoiceNumber: string | null;
  invoiceKunde: string | null;
  invoiceGrossCents: number;
}
export interface ReceiptSuggestion {
  match: Match;
  receiptHaendler: string | null;
  receiptDatum: string | null;
  receiptBruttoCents: number | null;
  txDatum: string;
  txGegen: string | null;
  txBetragCents: number;
}

export interface ReconcileSuggestions {
  payments: PaymentSuggestion[];
  receipts: ReceiptSuggestion[];
}

/**
 * Computes (does not persist) the current reconcile suggestions for a company:
 * incoming payments ↔ open invoices, and receipts ↔ outgoing transactions.
 * Already-linked items are excluded so confirmed matches don't reappear.
 */
export async function getReconcileSuggestions(
  billingEntityId: string,
): Promise<ReconcileSuggestions> {
  const supabase = await createSupabaseServerClient();

  const { data: txns } = await supabase
    .from('bookkeeping_transactions')
    .select('id, datum, gegen, zweck, betrag_cents, re_id, beleg_id')
    .eq('billing_entity_id', billingEntityId)
    .limit(5000);
  const allTx = txns ?? [];

  const linkedInvoiceIds = new Set(
    allTx.map((t) => t.re_id).filter((x): x is string => !!x),
  );
  const linkedReceiptIds = new Set(
    allTx.map((t) => t.beleg_id).filter((x): x is string => !!x),
  );

  const payments: TxLite[] = allTx
    .filter((t) => t.betrag_cents > 0 && !t.re_id)
    .map((t) => ({
      id: t.id,
      datum: t.datum,
      gegen: t.gegen,
      zweck: t.zweck,
      betragCents: t.betrag_cents,
    }));
  const outgoing: TxLite[] = allTx
    .filter((t) => t.betrag_cents < 0 && !t.beleg_id)
    .map((t) => ({
      id: t.id,
      datum: t.datum,
      gegen: t.gegen,
      zweck: t.zweck,
      betragCents: t.betrag_cents,
    }));

  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('id, invoice_number, gross_cents, issue_date, client_company_id, status')
    .eq('billing_entity_id', billingEntityId)
    .neq('status', 'paid')
    .limit(2000);
  const clientIds = [
    ...new Set((invoiceRows ?? []).map((i) => i.client_company_id)),
  ];
  const { data: clients } = clientIds.length
    ? await supabase.from('client_companies').select('id, name').in('id', clientIds)
    : { data: [] };
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));

  const invoices: InvoiceLite[] = (invoiceRows ?? [])
    .filter((i) => !linkedInvoiceIds.has(i.id))
    .map((i) => ({
      id: i.id,
      number: i.invoice_number,
      grossCents: i.gross_cents,
      issueDate: i.issue_date,
      kunde: clientName.get(i.client_company_id) ?? null,
    }));

  const { data: receiptRows } = await supabase
    .from('bookkeeping_receipts')
    .select('id, haendler, beleg_datum, brutto_cents, kind')
    .eq('billing_entity_id', billingEntityId)
    .eq('kind', 'ausgabe')
    .not('brutto_cents', 'is', null)
    .limit(2000);
  const receipts: ReceiptLite[] = (receiptRows ?? [])
    .filter((r) => !linkedReceiptIds.has(r.id))
    .map((r) => ({
      id: r.id,
      datum: r.beleg_datum,
      haendler: r.haendler,
      bruttoCents: r.brutto_cents,
    }));

  const paymentMatches = matchPaymentsToInvoices(payments, invoices);
  const receiptMatches = matchReceiptsToTransactions(receipts, outgoing);

  const txById = new Map(allTx.map((t) => [t.id, t]));
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const recById = new Map(receipts.map((r) => [r.id, r]));

  const paymentsOut: PaymentSuggestion[] = paymentMatches.flatMap((m) => {
    const tx = txById.get(m.leftId);
    const inv = invById.get(m.rightId);
    if (!tx || !inv) return [];
    return [
      {
        match: m,
        txDatum: tx.datum,
        txGegen: tx.gegen,
        txBetragCents: tx.betrag_cents,
        invoiceNumber: inv.number,
        invoiceKunde: inv.kunde,
        invoiceGrossCents: inv.grossCents,
      },
    ];
  });

  const receiptsOut: ReceiptSuggestion[] = receiptMatches.flatMap((m) => {
    const rec = recById.get(m.leftId);
    const tx = txById.get(m.rightId);
    if (!rec || !tx) return [];
    return [
      {
        match: m,
        receiptHaendler: rec.haendler,
        receiptDatum: rec.datum,
        receiptBruttoCents: rec.bruttoCents,
        txDatum: tx.datum,
        txGegen: tx.gegen,
        txBetragCents: tx.betrag_cents,
      },
    ];
  });

  return { payments: paymentsOut, receipts: receiptsOut };
}
