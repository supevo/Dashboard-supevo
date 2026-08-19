'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import {
  getReconcileSuggestions,
  getReconcileDiagnostics,
  classifyByMonth,
} from '@/features/accounting/reconcile-queries';

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Marks an invoice as paid once its matched payments (1:1 via re_id + any
 * allocations) cover the gross amount (Skonto tolerance 3,5 %). Keeps the
 * Rechnungen tab in sync with the Abgleich instead of leaving paid invoices
 * open. Never un-pays and never touches a manually voided invoice.
 */
async function settleInvoiceIfCovered(
  supabase: Supabase,
  invoiceId: string,
): Promise<void> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('gross_cents, status')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!inv || inv.status === 'paid' || inv.status === 'void') return;

  const [{ data: allocs }, { data: direct }] = await Promise.all([
    supabase
      .from('bookkeeping_tx_allocations')
      .select('betrag_cents')
      .eq('invoice_id', invoiceId),
    supabase
      .from('bookkeeping_transactions')
      .select('betrag_cents')
      .eq('re_id', invoiceId),
  ]);
  const covered =
    (allocs ?? []).reduce((s, a) => s + a.betrag_cents, 0) +
    (direct ?? []).reduce((s, t) => s + t.betrag_cents, 0);
  // Fully covered (allowing up to 3,5 % Skonto shortfall).
  if (covered >= Math.round(inv.gross_cents * 0.965)) {
    await supabase
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', invoiceId);
  }
}

/** Links a payment transaction to an invoice (tx.re_id + status gebucht). */
async function linkPayment(
  supabase: Supabase,
  txId: string,
  invoiceId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('bookkeeping_transactions')
    .update({ re_id: invoiceId, status: 'gebucht' })
    .eq('id', txId);
  if (error) return false;
  await settleInvoiceIfCovered(supabase, invoiceId);
  return true;
}

/** Links a receipt to an outgoing transaction (tx.beleg_id + receipt status). */
async function linkReceipt(
  supabase: Supabase,
  receiptId: string,
  txId: string,
): Promise<boolean> {
  const { error: e1 } = await supabase
    .from('bookkeeping_transactions')
    .update({ beleg_id: receiptId })
    .eq('id', txId);
  const { error: e2 } = await supabase
    .from('bookkeeping_receipts')
    .update({ status: 'zugeordnet' })
    .eq('id', receiptId);
  return !e1 && !e2;
}

/** Links a payment to a combination of invoices via the allocations table. */
async function linkCombo(
  supabase: Supabase,
  params: {
    txId: string;
    orgId: string;
    entityId: string;
    invoiceIds: string[];
  },
): Promise<boolean> {
  const { data: invs } = await supabase
    .from('invoices')
    .select('id, gross_cents')
    .in('id', params.invoiceIds);
  if (!invs || invs.length === 0) return false;
  const rows = invs.map((i) => ({
    organization_id: params.orgId,
    billing_entity_id: params.entityId,
    transaction_id: params.txId,
    invoice_id: i.id,
    betrag_cents: i.gross_cents,
  }));
  const { error } = await supabase
    .from('bookkeeping_tx_allocations')
    .upsert(rows, {
      onConflict: 'transaction_id,invoice_id',
      ignoreDuplicates: true,
    });
  if (error) return false;
  await supabase
    .from('bookkeeping_transactions')
    .update({ status: 'gebucht' })
    .eq('id', params.txId);
  for (const inv of invs) await settleInvoiceIfCovered(supabase, inv.id);
  return true;
}

/**
 * Links SEVERAL receipts to ONE outgoing payment (Amazon-Sammel-PDF) via the
 * bookkeeping_tx_receipts table. Sets the transaction's beleg_id to the first
 * receipt (so it counts as „belegt") and marks every receipt as zugeordnet.
 */
async function linkReceiptCombo(
  supabase: Supabase,
  params: {
    txId: string;
    orgId: string;
    entityId: string;
    userId: string;
    receiptIds: string[];
  },
): Promise<boolean> {
  const rows = params.receiptIds.map((rid) => ({
    organization_id: params.orgId,
    billing_entity_id: params.entityId,
    transaction_id: params.txId,
    receipt_id: rid,
    created_by: params.userId,
  }));
  const { error } = await supabase
    .from('bookkeeping_tx_receipts')
    .upsert(rows, {
      onConflict: 'transaction_id,receipt_id',
      ignoreDuplicates: true,
    });
  if (error) return false;
  await supabase
    .from('bookkeeping_transactions')
    .update({ beleg_id: params.receiptIds[0], status: 'gebucht' })
    .eq('id', params.txId);
  await supabase
    .from('bookkeeping_receipts')
    .update({ status: 'zugeordnet' })
    .in('id', params.receiptIds);
  return true;
}

/**
 * Links SEVERAL payments to ONE invoice (Teilzahlungen) via the allocations
 * table – each payment allocates its full amount to the invoice. The invoice is
 * then covered by the sum of the allocations (reconcile hides it once fully
 * allocated); no re_id is set because it is not a 1:1 link.
 */
async function linkSplit(
  supabase: Supabase,
  params: {
    invoiceId: string;
    orgId: string;
    entityId: string;
    transactions: { id: string; betrag_cents: number }[];
  },
): Promise<boolean> {
  const rows = params.transactions.map((t) => ({
    organization_id: params.orgId,
    billing_entity_id: params.entityId,
    transaction_id: t.id,
    invoice_id: params.invoiceId,
    betrag_cents: t.betrag_cents,
  }));
  const { error } = await supabase
    .from('bookkeeping_tx_allocations')
    .upsert(rows, {
      onConflict: 'transaction_id,invoice_id',
      ignoreDuplicates: true,
    });
  if (error) return false;
  await supabase
    .from('bookkeeping_transactions')
    .update({ status: 'gebucht' })
    .in(
      'id',
      params.transactions.map((t) => t.id),
    );
  await settleInvoiceIfCovered(supabase, params.invoiceId);
  return true;
}

async function authorizeEntity(
  supabase: Supabase,
  billingEntityId: string,
): Promise<string | null> {
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('organization_id')
    .eq('id', billingEntityId)
    .maybeSingle();
  if (!entity) return null;
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: entity.organization_id });
  return entity.organization_id;
}

/** Confirms one payment↔invoice suggestion. */
export async function applyPaymentMatchAction(input: {
  transactionId: string;
  invoiceId: string;
}): Promise<ActionResult> {
  if (
    !z.string().uuid().safeParse(input.transactionId).success ||
    !z.string().uuid().safeParse(input.invoiceId).success
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const { data: tx } = await supabase
    .from('bookkeeping_transactions')
    .select('organization_id')
    .eq('id', input.transactionId)
    .maybeSingle();
  if (!tx) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: tx.organization_id });

  const ok = await linkPayment(supabase, input.transactionId, input.invoiceId);
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Zahlung zugeordnet.');
}

/** Confirms one receipt↔transaction suggestion. */
export async function applyReceiptMatchAction(input: {
  receiptId: string;
  transactionId: string;
}): Promise<ActionResult> {
  if (
    !z.string().uuid().safeParse(input.receiptId).success ||
    !z.string().uuid().safeParse(input.transactionId).success
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const { data: tx } = await supabase
    .from('bookkeeping_transactions')
    .select('organization_id')
    .eq('id', input.transactionId)
    .maybeSingle();
  if (!tx) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: tx.organization_id });

  const ok = await linkReceipt(supabase, input.receiptId, input.transactionId);
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Beleg zugeordnet.');
}

/** Confirms one combination suggestion (payment ↔ several invoices). */
export async function applyComboMatchAction(input: {
  transactionId: string;
  invoiceIds: string[];
}): Promise<ActionResult> {
  if (
    !z.string().uuid().safeParse(input.transactionId).success ||
    !Array.isArray(input.invoiceIds) ||
    input.invoiceIds.length < 2 ||
    input.invoiceIds.length > 8 ||
    !input.invoiceIds.every((id) => z.string().uuid().safeParse(id).success)
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const { data: tx } = await supabase
    .from('bookkeeping_transactions')
    .select('organization_id, billing_entity_id')
    .eq('id', input.transactionId)
    .maybeSingle();
  if (!tx) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: tx.organization_id });

  const ok = await linkCombo(supabase, {
    txId: input.transactionId,
    orgId: tx.organization_id,
    entityId: tx.billing_entity_id,
    invoiceIds: input.invoiceIds,
  });
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Sammelzahlung zugeordnet.');
}

/** Confirms one receipt-combo suggestion (one payment ↔ several receipts). */
export async function applyReceiptComboAction(input: {
  transactionId: string;
  receiptIds: string[];
}): Promise<ActionResult> {
  if (
    !z.string().uuid().safeParse(input.transactionId).success ||
    !Array.isArray(input.receiptIds) ||
    input.receiptIds.length < 2 ||
    input.receiptIds.length > 12 ||
    !input.receiptIds.every((id) => z.string().uuid().safeParse(id).success)
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const { data: tx } = await supabase
    .from('bookkeeping_transactions')
    .select('organization_id, billing_entity_id')
    .eq('id', input.transactionId)
    .maybeSingle();
  if (!tx) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: tx.organization_id });

  const ok = await linkReceiptCombo(supabase, {
    txId: input.transactionId,
    orgId: tx.organization_id,
    entityId: tx.billing_entity_id,
    userId: user.id,
    receiptIds: input.receiptIds,
  });
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Beleg-Sammlung zugeordnet.');
}

/** Confirms one split suggestion (several payments ↔ one invoice). */
export async function applySplitMatchAction(input: {
  invoiceId: string;
  transactionIds: string[];
}): Promise<ActionResult> {
  if (
    !z.string().uuid().safeParse(input.invoiceId).success ||
    !Array.isArray(input.transactionIds) ||
    input.transactionIds.length < 2 ||
    input.transactionIds.length > 12 ||
    !input.transactionIds.every((id) => z.string().uuid().safeParse(id).success)
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const { data: txs } = await supabase
    .from('bookkeeping_transactions')
    .select('id, betrag_cents, organization_id, billing_entity_id')
    .in('id', input.transactionIds);
  if (!txs || txs.length !== input.transactionIds.length) {
    return errorResult(de.errors.FORBIDDEN);
  }
  const orgId = txs[0]!.organization_id;
  const entityId = txs[0]!.billing_entity_id;
  // All payments must belong to the same company/org (no cross-tenant linking).
  if (txs.some((t) => t.organization_id !== orgId || t.billing_entity_id !== entityId)) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  const ok = await linkSplit(supabase, {
    invoiceId: input.invoiceId,
    orgId,
    entityId,
    transactions: txs.map((t) => ({ id: t.id, betrag_cents: t.betrag_cents })),
  });
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Teilzahlungen zugeordnet.');
}

/** Persists rejected suggestion pairs so they are not proposed again. */
async function insertDismissals(
  supabase: Supabase,
  params: {
    orgId: string;
    entityId: string;
    userId: string;
    pairs: { a: string; b: string }[];
  },
): Promise<boolean> {
  const rows = params.pairs.map((p) => ({
    organization_id: params.orgId,
    billing_entity_id: params.entityId,
    a_id: p.a,
    b_id: p.b,
    created_by: params.userId,
  }));
  const { error } = await supabase
    .from('bookkeeping_reconcile_dismissals')
    .upsert(rows, {
      onConflict: 'billing_entity_id,a_id,b_id',
      ignoreDuplicates: true,
    });
  return !error;
}

/** Org + entity of a transaction, after authorizing the caller for that org. */
async function authorizeTx(
  supabase: Supabase,
  transactionId: string,
): Promise<{ orgId: string; entityId: string; userId: string } | null> {
  const { data: tx } = await supabase
    .from('bookkeeping_transactions')
    .select('organization_id, billing_entity_id')
    .eq('id', transactionId)
    .maybeSingle();
  if (!tx) return null;
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: tx.organization_id });
  return {
    orgId: tx.organization_id,
    entityId: tx.billing_entity_id,
    userId: user.id,
  };
}

/** Rejects a payment↔invoice suggestion. */
export async function dismissPaymentMatchAction(input: {
  transactionId: string;
  invoiceId: string;
}): Promise<ActionResult> {
  if (
    !z.string().uuid().safeParse(input.transactionId).success ||
    !z.string().uuid().safeParse(input.invoiceId).success
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const ctx = await authorizeTx(supabase, input.transactionId);
  if (!ctx) return errorResult(de.errors.FORBIDDEN);
  const ok = await insertDismissals(supabase, {
    ...ctx,
    pairs: [{ a: input.transactionId, b: input.invoiceId }],
  });
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Vorschlag abgelehnt.');
}

/** Rejects a receipt↔transaction suggestion. */
export async function dismissReceiptMatchAction(input: {
  receiptId: string;
  transactionId: string;
}): Promise<ActionResult> {
  if (
    !z.string().uuid().safeParse(input.receiptId).success ||
    !z.string().uuid().safeParse(input.transactionId).success
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const ctx = await authorizeTx(supabase, input.transactionId);
  if (!ctx) return errorResult(de.errors.FORBIDDEN);
  const ok = await insertDismissals(supabase, {
    ...ctx,
    pairs: [{ a: input.receiptId, b: input.transactionId }],
  });
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Vorschlag abgelehnt.');
}

/** Rejects a Sammelzahlung suggestion (payment ↔ several invoices). */
export async function dismissComboMatchAction(input: {
  transactionId: string;
  invoiceIds: string[];
}): Promise<ActionResult> {
  if (
    !z.string().uuid().safeParse(input.transactionId).success ||
    !Array.isArray(input.invoiceIds) ||
    input.invoiceIds.length < 1 ||
    input.invoiceIds.length > 8 ||
    !input.invoiceIds.every((id) => z.string().uuid().safeParse(id).success)
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const ctx = await authorizeTx(supabase, input.transactionId);
  if (!ctx) return errorResult(de.errors.FORBIDDEN);
  const ok = await insertDismissals(supabase, {
    ...ctx,
    pairs: input.invoiceIds.map((inv) => ({ a: input.transactionId, b: inv })),
  });
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Vorschlag abgelehnt.');
}

/** Rejects a receipt-combo suggestion (payment ↔ several receipts). */
export async function dismissReceiptComboAction(input: {
  transactionId: string;
  receiptIds: string[];
}): Promise<ActionResult> {
  if (
    !z.string().uuid().safeParse(input.transactionId).success ||
    !Array.isArray(input.receiptIds) ||
    input.receiptIds.length < 1 ||
    input.receiptIds.length > 12 ||
    !input.receiptIds.every((id) => z.string().uuid().safeParse(id).success)
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const ctx = await authorizeTx(supabase, input.transactionId);
  if (!ctx) return errorResult(de.errors.FORBIDDEN);
  const ok = await insertDismissals(supabase, {
    ...ctx,
    pairs: input.receiptIds.map((r) => ({ a: input.transactionId, b: r })),
  });
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Vorschlag abgelehnt.');
}

/** Rejects a Teilzahlung suggestion (invoice ↔ several payments). */
export async function dismissSplitMatchAction(input: {
  invoiceId: string;
  transactionIds: string[];
}): Promise<ActionResult> {
  if (
    !z.string().uuid().safeParse(input.invoiceId).success ||
    !Array.isArray(input.transactionIds) ||
    input.transactionIds.length < 1 ||
    input.transactionIds.length > 12 ||
    !input.transactionIds.every((id) => z.string().uuid().safeParse(id).success)
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const ctx = await authorizeTx(supabase, input.transactionIds[0]!);
  if (!ctx) return errorResult(de.errors.FORBIDDEN);
  const ok = await insertDismissals(supabase, {
    ...ctx,
    pairs: input.transactionIds.map((t) => ({ a: input.invoiceId, b: t })),
  });
  if (!ok) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Vorschlag abgelehnt.');
}

/**
 * Bulk-applies ALL suggestions of the current scope above a "safe" score bar
 * (≥ 0.7). The auto-run only applies corroborated ≥ 0.85 matches; this covers
 * the reviewed 70–85 % band and high-but-uncorroborated matches in one click,
 * while leaving genuinely weak (< 70 %) ones for manual decision. Respects
 * dismissals/exclusions (the engine already filters those out).
 */
const BULK_SAFE_THRESHOLD = 0.7;

export async function applyAllConfidentAction(
  billingEntityId: string,
  scope: { year?: number; month?: number } = {},
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(billingEntityId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const orgId = await authorizeEntity(supabase, billingEntityId);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const all = await getReconcileSuggestions(billingEntityId);
  const safe = (s: number) => s >= BULK_SAFE_THRESHOLD;
  const userId = (await requireUser()).id;

  let applied = 0;
  for (const p of all.payments) {
    if (!inScope(p.txDatum, scope) || !safe(p.match.score)) continue;
    if (await linkPayment(supabase, p.match.leftId, p.match.rightId)) applied += 1;
  }
  for (const r of all.receipts) {
    if (!inScope(r.txDatum, scope) || !safe(r.match.score)) continue;
    if (await linkReceipt(supabase, r.match.leftId, r.match.rightId)) applied += 1;
  }
  for (const c of all.combos) {
    if (!inScope(c.txDatum, scope) || !safe(c.match.score)) continue;
    const ok = await linkCombo(supabase, {
      txId: c.match.txId,
      orgId,
      entityId: billingEntityId,
      invoiceIds: c.match.invoiceIds,
    });
    if (ok) applied += 1;
  }
  for (const s of all.splits) {
    if (!inScope(s.txDatum, scope) || !safe(s.match.score)) continue;
    const ok = await linkSplit(supabase, {
      invoiceId: s.match.invoiceId,
      orgId,
      entityId: billingEntityId,
      transactions: s.payments.map((t) => ({ id: t.id, betrag_cents: t.betragCents })),
    });
    if (ok) applied += 1;
  }
  for (const rc of all.receiptCombos) {
    if (!inScope(rc.txDatum, scope) || !safe(rc.match.score)) continue;
    const ok = await linkReceiptCombo(supabase, {
      txId: rc.match.txId,
      orgId,
      entityId: billingEntityId,
      userId,
      receiptIds: rc.match.receiptIds,
    });
    if (ok) applied += 1;
  }

  revalidatePath('/app/finance');
  return successResult(
    applied > 0
      ? `${applied} sichere Vorschläge übernommen.`
      : 'Keine sicheren Vorschläge (ab 70 %) zum Übernehmen – bitte einzeln prüfen.',
  );
}

/** True if an ISO date (YYYY-MM-DD) falls in the given year/month. */
function inScope(
  datum: string,
  scope: { year?: number; month?: number },
): boolean {
  // Same window as the panel: the month plus a ±3-day fringe into the
  // previous/following month, so cross-boundary payments are included.
  return classifyByMonth(datum, scope.year, scope.month) !== null;
}

/**
 * Recomputes the reconcile suggestions for a company and reports how many are
 * open for review. Deliberately writes NOTHING – reconciliation is confirmed
 * manually (per row or via „Alle sicheren übernehmen"), because automatic
 * booking proved too error-prone. Scope limits the count by date: a month (with
 * year), or omitted for all open items across every month.
 */
export async function runReconcileAction(
  billingEntityId: string,
  scope: { year?: number; month?: number } = {},
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(billingEntityId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const orgId = await authorizeEntity(supabase, billingEntityId);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const all = await getReconcileSuggestions(billingEntityId);
  const payments = all.payments.filter((p) => inScope(p.txDatum, scope));
  const receipts = all.receipts.filter((r) => inScope(r.txDatum, scope));
  const combos = all.combos.filter((c) => inScope(c.txDatum, scope));
  const splits = all.splits.filter((s) => inScope(s.txDatum, scope));
  const openSuggestions =
    payments.length + receipts.length + combos.length + splits.length;

  revalidatePath('/app/finance');
  const where =
    scope.month != null ? `${scope.month}/${scope.year}` : 'alle Monate';
  let msg =
    openSuggestions > 0
      ? `${openSuggestions} Vorschläge zum Prüfen (${where}). Bitte einzeln bestätigen.`
      : `Keine Vorschläge (${where}).`;

  // Nothing matched at all → explain why, instead of a bare "0".
  if (openSuggestions === 0) {
    const d = await getReconcileDiagnostics(billingEntityId);
    const hints: string[] = [];
    const ohneBetrag = d.receiptsAusgabe - d.receiptsAusgabeMitBetrag;
    if (ohneBetrag > 0) {
      hints.push(
        `${ohneBetrag} Ausgabe-Belege ohne ausgelesenen Betrag – bitte zuerst „Belege mit KI auslesen“.`,
      );
    }
    if (d.receiptsAusgabeMitBetrag > 0 && d.txOutOffen === 0) {
      hints.push('Keine offenen Ausgaben-Umsätze zum Zuordnen.');
    }
    if (d.txInOffen > 0 && d.offeneRechnungen === 0 && d.receiptsEinnahme === 0) {
      hints.push(
        `${d.txInOffen} Zahlungseingänge, aber weder offene Rechnungen noch Einnahme-Belege zum Zuordnen.`,
      );
    }
    if (
      hints.length === 0 &&
      (d.receiptsAusgabeMitBetrag > 0 || d.receiptsEinnahme > 0)
    ) {
      hints.push(
        'Beträge oder Daten passen zu keinem Umsatz genau genug – bitte manuell zuordnen.',
      );
    }
    if (hints.length > 0) msg += ' Grund: ' + hints.join(' ');
  }
  return successResult(msg);
}
