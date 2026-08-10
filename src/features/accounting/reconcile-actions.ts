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
} from '@/features/accounting/reconcile-queries';

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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
  return !error;
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

/** True if an ISO date (YYYY-MM-DD) falls in the given year/month. */
function inScope(
  datum: string,
  scope: { year?: number; month?: number },
): boolean {
  if (scope.month == null) return true; // 'all'
  const y = Number(datum.slice(0, 4));
  const m = Number(datum.slice(5, 7));
  return y === scope.year && m === scope.month;
}

/**
 * Runs the reconcile engine for a company and auto-applies the confident matches
 * (score ≥ 0.85). Scope limits which bookings are considered by date: pass a
 * month (with year) to reconcile just that month, or omit it for all open items
 * across every month (e.g. to catch up on earlier unpaid payments).
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

  let applied = 0;
  for (const p of payments) {
    if (!p.match.auto) continue;
    if (await linkPayment(supabase, p.match.leftId, p.match.rightId)) applied += 1;
  }
  for (const r of receipts) {
    if (!r.match.auto) continue;
    if (await linkReceipt(supabase, r.match.leftId, r.match.rightId)) applied += 1;
  }
  for (const c of combos) {
    if (!c.match.auto) continue;
    const ok = await linkCombo(supabase, {
      txId: c.match.txId,
      orgId,
      entityId: billingEntityId,
      invoiceIds: c.match.invoiceIds,
    });
    if (ok) applied += 1;
  }

  const openSuggestions =
    payments.filter((p) => !p.match.auto).length +
    receipts.filter((r) => !r.match.auto).length +
    combos.filter((c) => !c.match.auto).length;

  revalidatePath('/app/finance');
  const where =
    scope.month != null ? `${scope.month}/${scope.year}` : 'alle Monate';
  let msg = `${applied} sichere Zuordnungen übernommen (${where}). ${openSuggestions} Vorschläge zum Prüfen.`;

  // Nothing matched at all → explain why, instead of a bare "0".
  if (applied === 0 && openSuggestions === 0) {
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
