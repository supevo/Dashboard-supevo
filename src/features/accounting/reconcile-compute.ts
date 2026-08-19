/**
 * Pure reconcile computation (no DB, no server-only) so the whole Abgleich can
 * be unit-tested end-to-end with realistic fixtures. getReconcileSuggestions
 * (reconcile-queries.ts) only fetches the rows and calls computeReconcile.
 */
import {
  matchPaymentsToInvoices,
  matchReceiptsToTransactions,
  matchPaymentCombinations,
  matchInvoiceSplitPayments,
  SUGGEST_THRESHOLD,
  type TxLite,
  type InvoiceLite,
  type ReceiptLite,
} from '@/features/accounting/reconcile';
import type {
  ReconcileSuggestions,
  PaymentSuggestion,
  ReceiptSuggestion,
  ComboSuggestion,
  SplitSuggestion,
  OpenBooking,
  OpenReceipt,
} from '@/features/accounting/reconcile-queries';

/** Raw rows the reconcile computation needs (as fetched from the DB). */
export interface ReconcileInputRows {
  txRows: {
    id: string;
    datum: string;
    gegen: string | null;
    zweck: string | null;
    betrag_cents: number;
    re_id: string | null;
    beleg_id: string | null;
    beleg_nicht_noetig: boolean;
    kategorie_id: string | null;
  }[];
  allocRows: { transaction_id: string; invoice_id: string; betrag_cents: number }[];
  /** Open (not-paid) invoices only. */
  invoiceRows: {
    id: string;
    invoice_number: string | null;
    gross_cents: number;
    issue_date: string | null;
    client_company_id: string;
    payment_ref?: string | null;
  }[];
  clientName: Map<string, string | null>;
  receiptRows: {
    id: string;
    haendler: string | null;
    beleg_datum: string | null;
    brutto_cents: number | null;
    kind: string;
    rechnungsnummer?: string | null;
    konfidenz?: number | null;
    rohtext?: string | null;
  }[];
  /** Vom Nutzer abgelehnte Paare (a_id ↔ b_id), die nicht mehr vorgeschlagen werden. */
  dismissed?: { a_id: string; b_id: string }[];
  /** Kategorien, die komplett aus dem Abgleich ausgeklammert werden. */
  excludedCategories?: string[];
  minScore?: number;
}

/**
 * Two directions: incoming payments ↔ open invoices (+ Einnahme-Belege), and
 * Ausgabe-Belege ↔ outgoing payments; plus Sammelzahlungen (one payment → many
 * invoices) and Teilzahlungen (one invoice → many payments). Already-linked
 * items (re_id / beleg_id / allocations) and "kein Beleg nötig" bookings are
 * excluded. Only receipts with an extracted brutto_cents can match.
 */
export function computeReconcile({
  txRows,
  allocRows,
  invoiceRows,
  clientName,
  receiptRows,
  dismissed = [],
  excludedCategories = [],
  minScore = SUGGEST_THRESHOLD,
}: ReconcileInputRows): ReconcileSuggestions {
  const allTx = txRows;
  const excludedCats = new Set(excludedCategories);
  const isExcludedTx = (t: (typeof allTx)[number]) =>
    !!t.kategorie_id && excludedCats.has(t.kategorie_id);

  // Abgelehnte Paare in beide Richtungen als Set (Reihenfolge egal).
  const dismissedPairs = new Set<string>();
  for (const p of dismissed) {
    dismissedPairs.add(`${p.a_id}::${p.b_id}`);
    dismissedPairs.add(`${p.b_id}::${p.a_id}`);
  }
  const isDismissed = (a: string, b: string) =>
    dismissedPairs.has(`${a}::${b}`);

  const allocatedTxIds = new Set(allocRows.map((a) => a.transaction_id));
  const invoiceAllocatedCents = new Map<string, number>();
  for (const a of allocRows) {
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
  const noDocTxIds = new Set(
    allTx.filter((t) => t.beleg_nicht_noetig).map((t) => t.id),
  );

  const payments: TxLite[] = allTx
    .filter(
      (t) =>
        t.betrag_cents > 0 &&
        !t.re_id &&
        !allocatedTxIds.has(t.id) &&
        !isExcludedTx(t),
    )
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
        !allocatedTxIds.has(t.id) &&
        !isExcludedTx(t),
    )
    .map((t) => ({
      id: t.id,
      datum: t.datum,
      gegen: t.gegen,
      zweck: t.zweck,
      betragCents: t.betrag_cents,
    }));

  const invoices: InvoiceLite[] = invoiceRows
    .filter((i) => !linkedInvoiceIds.has(i.id))
    .filter((i) => (invoiceAllocatedCents.get(i.id) ?? 0) < i.gross_cents - 2)
    .map((i) => ({
      id: i.id,
      number: i.invoice_number,
      grossCents: i.gross_cents,
      issueDate: i.issue_date,
      kunde: clientName.get(i.client_company_id) ?? null,
      paymentRef: i.payment_ref ?? null,
    }));

  const toLite = (r: {
    id: string;
    haendler: string | null;
    beleg_datum: string | null;
    brutto_cents: number | null;
    rechnungsnummer?: string | null;
  }): ReceiptLite => ({
    id: r.id,
    datum: r.beleg_datum,
    haendler: r.haendler,
    bruttoCents: r.brutto_cents,
    rechnungsnummer: r.rechnungsnummer ?? null,
  });
  const usableReceipts = receiptRows.filter((r) => r.brutto_cents != null);
  const ausgabeReceipts: ReceiptLite[] = usableReceipts
    .filter((r) => r.kind === 'ausgabe' && !linkedReceiptIds.has(r.id))
    .map(toLite);
  const einnahmeReceipts: ReceiptLite[] = usableReceipts
    .filter((r) => r.kind === 'einnahme' && !linkedReceiptIds.has(r.id))
    .map(toLite);

  // Reihenfolge: die "mehrteiligen" Muster ZUERST, weil die 1:1-Zuordnung sonst
  // eine Zahlung schon an eine einzelne Rechnung "verbraucht" (die Rechnungs-
  // nummer im Zweck allein reicht ihr), bevor Sammel-/Teilzahlung greifen kann.

  // 1) Teilzahlungen: mehrere Zahlungen → eine Rechnung.
  const splitMatches = matchInvoiceSplitPayments(payments, invoices).filter(
    (m) => !m.txIds.some((t) => isDismissed(m.invoiceId, t)),
  );
  const usedSplitTx = new Set(splitMatches.flatMap((m) => m.txIds));
  const usedSplitInv = new Set(splitMatches.map((m) => m.invoiceId));
  const paymentsAfterSplit = payments.filter((p) => !usedSplitTx.has(p.id));
  const invoicesAfterSplit = invoices.filter((i) => !usedSplitInv.has(i.id));

  // 2) Sammelzahlungen: eine Zahlung → mehrere Rechnungen.
  const comboMatches = matchPaymentCombinations(
    paymentsAfterSplit,
    invoicesAfterSplit,
  ).filter((m) => !m.invoiceIds.some((inv) => isDismissed(m.txId, inv)));
  const usedComboTx = new Set(comboMatches.map((m) => m.txId));
  const usedComboInv = new Set(comboMatches.flatMap((m) => m.invoiceIds));
  const paymentsLeft = paymentsAfterSplit.filter((p) => !usedComboTx.has(p.id));
  const invoicesLeft = invoicesAfterSplit.filter(
    (i) => !usedComboInv.has(i.id),
  );

  // 3) 1:1 Zahlung ↔ Rechnung auf dem Rest.
  const paymentMatches = matchPaymentsToInvoices(
    paymentsLeft,
    invoicesLeft,
    minScore,
  ).filter((m) => !isDismissed(m.leftId, m.rightId));
  const usedPayTx = new Set(paymentMatches.map((m) => m.leftId));

  // 4) Ausgabe-Belege ↔ Ausgänge, Einnahme-Belege ↔ Eingänge (die nicht schon
  //    einer Rechnung/Sammelzahlung zugeordnet wurden).
  const incomingForReceipts = paymentsLeft.filter((p) => !usedPayTx.has(p.id));
  const receiptMatches = [
    ...matchReceiptsToTransactions(ausgabeReceipts, outgoing, 'out', minScore),
    ...matchReceiptsToTransactions(
      einnahmeReceipts,
      incomingForReceipts,
      'in',
      minScore,
    ),
  ].filter((m) => !isDismissed(m.leftId, m.rightId));
  const receipts = [...ausgabeReceipts, ...einnahmeReceipts];

  const txById = new Map(allTx.map((t) => [t.id, t]));
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const recById = new Map(receipts.map((r) => [r.id, r]));
  // Zusatz-Infos je Beleg (für die aufklappbare „was wurde gescannt"-Ansicht).
  const recMetaById = new Map(receiptRows.map((r) => [r.id, r]));

  const paymentsOut: PaymentSuggestion[] = paymentMatches.flatMap((m) => {
    const tx = txById.get(m.leftId);
    const inv = invById.get(m.rightId);
    if (!tx || !inv) return [];
    return [
      {
        match: m,
        txDatum: tx.datum,
        txGegen: tx.gegen,
        txZweck: tx.zweck,
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
    const meta = recMetaById.get(m.leftId);
    return [
      {
        match: m,
        receiptHaendler: rec.haendler,
        receiptDatum: rec.datum,
        receiptBruttoCents: rec.bruttoCents,
        receiptRechnungsnummer: meta?.rechnungsnummer ?? null,
        receiptKonfidenz: meta?.konfidenz ?? null,
        receiptRohtext: meta?.rohtext ?? null,
        txDatum: tx.datum,
        txGegen: tx.gegen,
        txZweck: tx.zweck,
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
    return [{ match: m, txDatum: tx.datum, txGegen: tx.gegen, invoices: invoices2 }];
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
  // "Beleg fehlt" / "ohne Zuordnung": open bookings with no match at all.
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

  // Ausgeklammerte Kategorien: aus dem Abgleich raus, aber für den CSV-Export
  // (Kommentar „liegt dem Steuerberater vor") separat gesammelt.
  const excluded: OpenBooking[] = allTx
    .filter((t) => isExcludedTx(t))
    .map((t) => ({
      txId: t.id,
      txDatum: t.datum,
      txGegen: t.gegen,
      txZweck: t.zweck,
      txBetragCents: t.betrag_cents,
      kategorieId: t.kategorie_id,
    }));

  // Belege OHNE passende Zahlung: Rechnungen/Belege, zu denen der Abgleich
  // keine Bankbewegung gefunden hat. Einnahme = Ausgangsrechnung ohne Eingang,
  // Ausgabe = Eingangsrechnung ohne Zahlung.
  const matchedReceiptIds = new Set(receiptMatches.map((m) => m.leftId));
  const toOpenReceipt = (r: ReceiptLite): OpenReceipt => ({
    receiptId: r.id,
    haendler: r.haendler,
    datum: r.datum,
    bruttoCents: r.bruttoCents,
    rechnungsnummer: r.rechnungsnummer ?? null,
    txDatum: r.datum ?? '',
  });
  const unpaidOutgoing: OpenReceipt[] = einnahmeReceipts
    .filter((r) => !matchedReceiptIds.has(r.id))
    .map(toOpenReceipt);
  const unpaidIncoming: OpenReceipt[] = ausgabeReceipts
    .filter((r) => !matchedReceiptIds.has(r.id))
    .map(toOpenReceipt);

  return {
    payments: paymentsOut,
    receipts: receiptsOut,
    combos: combosOut,
    splits: splitsOut,
    missingReceipts,
    missingIncoming,
    excluded,
    unpaidOutgoing,
    unpaidIncoming,
  };
}
