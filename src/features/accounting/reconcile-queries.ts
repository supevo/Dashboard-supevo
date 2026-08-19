import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  SUGGEST_THRESHOLD,
  WEAK_THRESHOLD,
  type Match,
  type ComboMatch,
  type SplitMatch,
} from '@/features/accounting/reconcile';
import { computeReconcile } from '@/features/accounting/reconcile-compute';

export interface PaymentSuggestion {
  match: Match;
  txDatum: string;
  txGegen: string | null;
  txZweck: string | null;
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
  receiptRechnungsnummer: string | null;
  receiptKonfidenz: number | null;
  receiptRohtext: string | null;
  txDatum: string;
  txGegen: string | null;
  txZweck: string | null;
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
  /** Kategorie der Buchung (für ausgeklammerte Kategorien im CSV-Export). */
  kategorieId?: string | null;
}

/** A receipt/invoice for which NO matching bank booking exists (yet). */
export interface OpenReceipt {
  receiptId: string;
  haendler: string | null;
  datum: string | null;
  bruttoCents: number | null;
  rechnungsnummer: string | null;
  /** = datum, für den Monatsfilter (inView). */
  txDatum: string;
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
  /** Aus dem Abgleich ausgeklammerte Buchungen (bestimmte Kategorien). */
  excluded: OpenBooking[];
  /**
   * Ausgangsrechnungen / Einnahme-Belege OHNE passenden Zahlungseingang –
   * gestellte Rechnungen, die (noch) nicht bezahlt wurden.
   */
  unpaidOutgoing: OpenReceipt[];
  /**
   * Eingangsrechnungen / Ausgabe-Belege OHNE passende Zahlung –
   * Lieferantenrechnungen, die (noch) nicht bezahlt sind.
   */
  unpaidIncoming: OpenReceipt[];
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
 * Builds the learned „counterparty IBAN → client" map from bookkeeping rows that
 * are already linked to an invoice (re_id) and carry a counterparty IBAN. Only
 * IBANs that map to exactly one client are kept – ambiguous ones are dropped so
 * they never drive a wrong automatic booking.
 */
async function getLearnedIbanClientMap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  billingEntityId: string,
  txns: { gegen_iban?: string | null; re_id: string | null }[],
): Promise<Map<string, string>> {
  const linked = txns.filter(
    (t): t is { gegen_iban: string; re_id: string } =>
      !!t.gegen_iban && !!t.re_id,
  );
  if (linked.length === 0) return new Map();

  const reIds = [...new Set(linked.map((t) => t.re_id))];
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, client_company_id')
    .eq('billing_entity_id', billingEntityId)
    .in('id', reIds);
  const clientByInvoice = new Map(
    (invoices ?? []).map((i) => [i.id, i.client_company_id] as const),
  );

  // Sammle je IBAN alle beobachteten Kunden; nur eindeutige IBANs übernehmen.
  const clientsByIban = new Map<string, Set<string>>();
  for (const t of linked) {
    const client = clientByInvoice.get(t.re_id);
    if (!client) continue;
    const set = clientsByIban.get(t.gegen_iban) ?? new Set<string>();
    set.add(client);
    clientsByIban.set(t.gegen_iban, set);
  }
  const map = new Map<string, string>();
  for (const [iban, clients] of clientsByIban) {
    if (clients.size === 1) map.set(iban, [...clients][0]!);
  }
  return map;
}

/**
 * Fetches a company's rows and computes the reconcile suggestions.
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
      'id, datum, gegen, gegen_iban, zweck, betrag_cents, re_id, beleg_id, beleg_nicht_noetig, kategorie_id',
    )
    .eq('billing_entity_id', billingEntityId)
    .limit(5000);

  // Gelerntes Mapping „Gegen-IBAN → Kunde" aus früher bestätigten Zahlungen:
  // Bankbuchungen, die bereits einer Rechnung zugeordnet sind (re_id) und eine
  // Gegen-IBAN tragen. Nur eindeutige IBANs (genau ein Kunde) werden genutzt.
  const ibanClientId = await getLearnedIbanClientMap(
    supabase,
    billingEntityId,
    txns ?? [],
  );

  const { data: profile } = await supabase
    .from('accounting_profiles')
    .select('abgleich_ausschluss')
    .eq('billing_entity_id', billingEntityId)
    .maybeSingle();
  const excludedCategories = profile?.abgleich_ausschluss ?? [];

  const { data: allocRows } = await supabase
    .from('bookkeeping_tx_allocations')
    .select('transaction_id, invoice_id, betrag_cents')
    .eq('billing_entity_id', billingEntityId)
    .limit(20000);

  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, gross_cents, issue_date, client_company_id, status, payment_ref',
    )
    .eq('billing_entity_id', billingEntityId)
    .neq('status', 'paid')
    .limit(2000);
  const clientIds = [
    ...new Set((invoiceRows ?? []).map((i) => i.client_company_id)),
  ];
  const { data: clients } = clientIds.length
    ? await supabase.from('client_companies').select('id, name').in('id', clientIds)
    : { data: [] };
  const clientName = new Map<string, string | null>(
    (clients ?? []).map((c) => [c.id, c.name]),
  );

  const { data: receiptRows } = await supabase
    .from('bookkeeping_receipts')
    .select(
      'id, haendler, beleg_datum, brutto_cents, kind, rechnungsnummer, konfidenz, rohtext',
    )
    .eq('billing_entity_id', billingEntityId)
    .in('kind', ['ausgabe', 'einnahme'])
    .not('brutto_cents', 'is', null)
    .limit(4000);

  // Vom Nutzer abgelehnte Vorschläge (Tabelle fehlt evtl. → leer, kein Crash).
  const { data: dismissRows } = await supabase
    .from('bookkeeping_reconcile_dismissals')
    .select('a_id, b_id')
    .eq('billing_entity_id', billingEntityId)
    .limit(20000);

  return computeReconcile({
    txRows: txns ?? [],
    allocRows: allocRows ?? [],
    invoiceRows: invoiceRows ?? [],
    clientName,
    receiptRows: receiptRows ?? [],
    dismissed: dismissRows ?? [],
    excludedCategories,
    ibanClientId,
    minScore,
  });
}
