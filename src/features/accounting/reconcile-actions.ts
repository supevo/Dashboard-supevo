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
import { getReconcileSuggestions } from '@/features/accounting/reconcile-queries';

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

  let applied = 0;
  for (const p of payments) {
    if (!p.match.auto) continue;
    if (await linkPayment(supabase, p.match.leftId, p.match.rightId)) applied += 1;
  }
  for (const r of receipts) {
    if (!r.match.auto) continue;
    if (await linkReceipt(supabase, r.match.leftId, r.match.rightId)) applied += 1;
  }

  const openSuggestions =
    payments.filter((p) => !p.match.auto).length +
    receipts.filter((r) => !r.match.auto).length;

  revalidatePath('/app/finance');
  const where =
    scope.month != null ? `${scope.month}/${scope.year}` : 'alle Monate';
  return successResult(
    `${applied} sichere Zuordnungen übernommen (${where}). ${openSuggestions} Vorschläge zum Prüfen.`,
  );
}
