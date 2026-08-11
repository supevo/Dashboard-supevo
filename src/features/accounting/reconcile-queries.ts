import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  matchPaymentsToInvoices,
  matchReceiptsToTransactions,
  matchPaymentCombinations,
  matchInvoiceSplitPayments,
  SUGGEST_THRESHOLD,
  WEAK_THRESHOLD,
  type Match,
  type ComboMatch,
  type SplitMatch,
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

export interface ComboSuggestion {
  match: ComboMatch;
  txDatum: string;
  txGegen: string | null;
  invoices: {
    id: string;
    number: string | null;
    kunde: string | null;
    grossCents: number;
  }[];
}

export interface SplitSuggestion {
  match: SplitMatch;
  invoiceNumber: string | null;
  invoiceKunde: string | null;
  invoiceGrossCents: number;
  /** Latest payment date – used to place the split in the month view. */
  txDatum: string;
  payments: {
    id: string;
    datum: string;
    gegen: string | null;
    betragCents: number;
  }[];
}

/** An open bank booking that the engine found NO document/match for. */
export interface OpenBooking {
  txId: string;
  txDatum: string;
  txGegen: string | null;
  txZweck: string | null;
  txBetragCents: number;
}

export interface ReconcileSuggestions {
  payments: PaymentSuggestion[];
  receipts: ReceiptSuggestion[];
  combos: ComboSuggestion[];
  /** One invoice total ↔ several partial payments (Teilzahlungen). */
  splits: SplitSuggestion[];
  /** Ausgaben (outgoing) without any matching receipt – a Beleg is missing. */
  missingReceipts: OpenBooking[];
  /** Eingänge (incoming) without any matching invoice/receipt/combo. */
  missingIncoming: OpenBooking[];
}

export type PeriodClass = 'in' | 'vor' | 'folge' | null;

/**
 * Classifies a booking date against a selected month: 'in' = within the month,
 * 'vor'/'folge' = within 3 days before/after the month (payment in the
 * previous/following month), null = outside the ±3-day window (hidden). With no
 * month (0/undefined) everything counts as 'in'.
 */
export function classifyByMonth(
  datum: string | null,
  year?: number,
  month?: number,
): PeriodClass {
  if (!month || !year) return 'in';
  if (!datum) return null;
  const d = datum.slice(0, 10);
  const mm = String(month).padStart(2, '0');
  const first = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const last = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  if (d >= first && d <= last) return 'in';
  const DAY = 86_400_000;
  const dMs = new Date(`${d}T00:00:00Z`).getTime();
  const firstMs = new Date(`${first}T00:00:00Z`).getTime();
  const lastMs = new Date(`${last}T00:00:00Z`).getTime();
  if (dMs < firstMs && firstMs - dMs <= 3 * DAY) return 'vor';
  if (dMs > lastMs && dMs - lastMs <= 3 * DAY) return 'folge';
  return null;
}

export interface ReconcileDiagnostics {
  receiptsAusgabe: number;
  receiptsAusgabeMitBetrag: number;
  receiptsEinnahme: number;
  txOutOffen: number;
  txInOffen: number;
  offeneRechnungen: number;
}

/** Raw counts that explain WHY reconcile finds (or doesn't find) matches. */
export async function getReconcileDiagnostics(
  billingEntityId: string,
): Promise<ReconcileDiagnostics> {
  const supabase = await createSupabaseServerClient();

  const [
    { count: receiptsAusgabe },
    { count: receiptsAusgabeMitBetrag },
    { count: receiptsEinnahme },
    { count: txOutOffen },
    { count: txInOffen },
    { count: offeneRechnungen },
  ] = await Promise.all([
    supabase
      .from('bookkeeping_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('billing_entity_id', billingEntityId)
      .eq('kind', 'ausgabe'),
    supabase
      .from('bookkeeping_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('billing_entity_id', billingEntityId)
      .eq('kind', 'ausgabe')
      .not('brutto_cents', 'is', null),
    supabase
      .from('bookkeeping_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('billing_entity_id', billingEntityId)
      .eq('kind', 'einnahme'),
    supabase
      .from('bookkeeping_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('billing_entity_id', billingEntityId)
      .lt('betrag_cents', 0)
      .is('beleg_id', null),
    supabase
      .from('bookkeeping_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('billing_entity_id', billingEntityId)
      .gt('betrag_cents', 0)
      .is('re_id', null),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('billing_entity_id', billingEntityId)
      .neq('status', 'paid'),
  ]);
  return {
    receiptsAusgabe: receiptsAusgabe ?? 0,
    receiptsAusgabeMitBetrag: receiptsAusgabeMitBetrag ?? 0,
    receiptsEinnahme: receiptsEinnahme ?? 0,
    txOutOffen: txOutOffen ?? 0,
    txInOffen: txInOffen ?? 0,
    offeneRechnungen: offeneRechnungen ?? 0,
  };
}

/**
 * Computes (does not persist) the current reconcile suggestions for a company:
 * incoming payments ↔ open invoices, and receipts ↔ outgoing transactions.
 * Already-linked items are excluded so confirmed matches don't reappear.
 *
 * `weak: true` (the "erneut abgleichen" pass) lowers the suggest bar to
 * WEAK_THRESHOLD so borderline candidates for still-open bookings resurface.
 */
export async function getReconcileSuggestions(
  billingEntityId: string,
  opts: { weak?: boolean } = {},
): Promise<ReconcileSuggestions> {
  const minScore = opts.weak ? WEAK_THRESHOLD : SUGGEST_THRESHOLD;
  const supabase = await createSupabaseServerClient();

  const { data: txns } = await supabase
    .from('bookkeeping_transactions')
    .select(
      'id, datum, gegen, zweck, betrag_cents, re_id, beleg_id, beleg_nicht_noetig',
    )
    .eq('billing_entity_id', billingEntityId)
    .limit(5000);
  const allTx = txns ?? [];

  // Sammelzahlungen/Teilzahlungen are recorded in the allocations table, not in
  // re_id. Without reading it, applied combos/splits would reappear forever.
  const { data: allocRows } = await supabase
    .from('bookkeeping_tx_allocations')
    .select('transaction_id, invoice_id, betrag_cents')
    .eq('billing_entity_id', billingEntityId)
    .limit(20000);
  const allocatedTxIds = new Set(
    (allocRows ?? []).map((a) => a.transaction_id),
  );
  const invoiceAllocatedCents = new Map<string, number>();
  for (const a of allocRows ?? []) {
    invoiceAllocatedCents.set(
      a.invoice_id,
      (invoiceAllocatedCents.get(a.invoice_id) ?? 0) + a.betrag_cents,
    );
  }

  const linkedInvoiceIds = new Set(
    allTx.map((t) => t.re_id).filter((x): x is string => !!x),
  );
  const linkedReceiptIds = new Set(
    allTx.map((t) => t.beleg_id).filter((x): x is string => !!x),
  );
  // Bookings the user marked as "no receipt needed" stay out of the receipt
  // matching AND out of the "Beleg fehlt" list.
  const noDocTxIds = new Set(
    allTx.filter((t) => t.beleg_nicht_noetig).map((t) => t.id),
  );

  const payments: TxLite[] = allTx
    .filter((t) => t.betrag_cents > 0 && !t.re_id && !allocatedTxIds.has(t.id))
    .map((t) => ({
      id: t.id,
      datum: t.datum,
      gegen: t.gegen,
      zweck: t.zweck,
      betragCents: t.betrag_cents,
    }));
  const outgoing: TxLite[] = allTx
    .filter(
      (t) =>
        t.betrag_cents < 0 &&
        !t.beleg_id &&
        !t.beleg_nicht_noetig &&
        !allocatedTxIds.has(t.id),
    )
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
    // Drop invoices already fully covered by allocations (combo/split applied).
    .filter(
      (i) => (invoiceAllocatedCents.get(i.id) ?? 0) < i.gross_cents - 2,
    )
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
    .in('kind', ['ausgabe', 'einnahme'])
    .not('brutto_cents', 'is', null)
    .limit(4000);
  const toLite = (r: {
    id: string;
    haendler: string | null;
    beleg_datum: string | null;
    brutto_cents: number | null;
  }): ReceiptLite => ({
    id: r.id,
    datum: r.beleg_datum,
    haendler: r.haendler,
    bruttoCents: r.brutto_cents,
  });
  const ausgabeReceipts: ReceiptLite[] = (receiptRows ?? [])
    .filter((r) => r.kind === 'ausgabe' && !linkedReceiptIds.has(r.id))
    .map(toLite);
  const einnahmeReceipts: ReceiptLite[] = (receiptRows ?? [])
    .filter((r) => r.kind === 'einnahme' && !linkedReceiptIds.has(r.id))
    .map(toLite);

  const paymentMatches = matchPaymentsToInvoices(payments, invoices, minScore);
  const usedPayTx = new Set(paymentMatches.map((m) => m.leftId));

  // Ausgabe-Belege ↔ Ausgänge, Einnahme-Belege ↔ Eingänge (die nicht schon
  // einer Rechnung zugeordnet wurden).
  const incomingForReceipts = payments.filter((p) => !usedPayTx.has(p.id));
  const receiptMatches = [
    ...matchReceiptsToTransactions(ausgabeReceipts, outgoing, 'out', minScore),
    ...matchReceiptsToTransactions(
      einnahmeReceipts,
      incomingForReceipts,
      'in',
      minScore,
    ),
  ];
  const receipts = [...ausgabeReceipts, ...einnahmeReceipts];

  // Combination matches on what the 1:1 pass left unmatched.
  const usedInv = new Set(paymentMatches.map((m) => m.rightId));
  const usedReceiptTx = new Set(receiptMatches.map((m) => m.rightId));
  const openPayments = payments.filter(
    (p) => !usedPayTx.has(p.id) && !usedReceiptTx.has(p.id),
  );
  const comboMatches = matchPaymentCombinations(
    openPayments,
    invoices.filter((i) => !usedInv.has(i.id)),
  );

  // Teilzahlungen: one invoice total ↔ several payments the earlier passes left
  // over. Uses payments not already claimed by a 1:1 match, a receipt or a combo.
  const usedComboTx = new Set(comboMatches.map((m) => m.txId));
  const usedComboInv = new Set(comboMatches.flatMap((m) => m.invoiceIds));
  const splitMatches = matchInvoiceSplitPayments(
    openPayments.filter((p) => !usedComboTx.has(p.id)),
    invoices.filter((i) => !usedInv.has(i.id) && !usedComboInv.has(i.id)),
  );

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

  const combosOut: ComboSuggestion[] = comboMatches.flatMap((m) => {
    const tx = txById.get(m.txId);
    if (!tx) return [];
    const invoices2 = m.invoiceIds
      .map((id) => invById.get(id))
      .filter((x): x is InvoiceLite => !!x)
      .map((inv) => ({
        id: inv.id,
        number: inv.number,
        kunde: inv.kunde,
        grossCents: inv.grossCents,
      }));
    if (invoices2.length < 2) return [];
    return [
      {
        match: m,
        txDatum: tx.datum,
        txGegen: tx.gegen,
        invoices: invoices2,
      },
    ];
  });

  const splitsOut: SplitSuggestion[] = splitMatches.flatMap((m) => {
    const inv = invById.get(m.invoiceId);
    if (!inv) return [];
    const pays = m.txIds
      .map((id) => txById.get(id))
      .filter((t): t is (typeof allTx)[number] => !!t)
      .map((t) => ({
        id: t.id,
        datum: t.datum,
        gegen: t.gegen,
        betragCents: t.betrag_cents,
      }));
    if (pays.length < 2) return [];
    // Latest payment date positions the split in the month view.
    const txDatum = pays.reduce((a, b) => (a.datum >= b.datum ? a : b)).datum;
    return [
      {
        match: m,
        invoiceNumber: inv.number,
        invoiceKunde: inv.kunde,
        invoiceGrossCents: inv.grossCents,
        txDatum,
        payments: pays,
      },
    ];
  });
  const usedSplitTx = new Set(splitMatches.flatMap((m) => m.txIds));

  // "Beleg fehlt": open Ausgänge with no receipt match at all (the receipt is
  // missing or unreadable) → the user must find and upload it. Open Eingänge
  // with no invoice/receipt/combo match are flagged separately.
  const matchedOutTx = new Set(
    receiptMatches
      .map((m) => txById.get(m.rightId))
      .filter((t): t is (typeof allTx)[number] => !!t && t.betrag_cents < 0)
      .map((t) => t.id),
  );
  const matchedInTx = new Set<string>([
    ...paymentMatches.map((m) => m.leftId),
    ...comboMatches.map((m) => m.txId),
    ...receiptMatches
      .map((m) => txById.get(m.rightId))
      .filter((t): t is (typeof allTx)[number] => !!t && t.betrag_cents > 0)
      .map((t) => t.id),
  ]);
  const toOpen = (t: TxLite): OpenBooking => ({
    txId: t.id,
    txDatum: t.datum,
    txGegen: t.gegen,
    txZweck: t.zweck,
    txBetragCents: t.betragCents,
  });
  const missingReceipts: OpenBooking[] = outgoing
    .filter((t) => !matchedOutTx.has(t.id))
    .map(toOpen);
  const missingIncoming: OpenBooking[] = payments
    .filter(
      (t) =>
        !matchedInTx.has(t.id) &&
        !usedSplitTx.has(t.id) &&
        !noDocTxIds.has(t.id),
    )
    .map(toOpen);

  return {
    payments: paymentsOut,
    receipts: receiptsOut,
    combos: combosOut,
    splits: splitsOut,
    missingReceipts,
    missingIncoming,
  };
}
