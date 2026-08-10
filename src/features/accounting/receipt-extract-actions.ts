'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { downloadItem } from '@/lib/onedrive/graph';
import {
  extractReceipt,
  isReceiptVisionEnabled,
  resolveReceiptMime,
  isReadableReceiptMime,
  type ReceiptExtractionContext,
} from '@/lib/ai/vision';
import { KATEGORIEN } from '@/features/accounting/categories';
import type { Database } from '@/lib/database.types';
import { de } from '@/lib/i18n/de';

type ReceiptUpdate =
  Database['public']['Tables']['bookkeeping_receipts']['Update'];
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const KAT_IDS = new Set(KATEGORIEN.map((k) => k.id));
const KAT_CONTEXT = KATEGORIEN.map((k) => ({ id: k.id, label: k.label, art: k.art }));

function euroToCents(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100);
}

/** Builds the fields to persist from a raw extraction. */
function toReceiptUpdate(
  ext: Awaited<ReturnType<typeof extractReceipt>>,
): ReceiptUpdate | null {
  if (!ext) return null;
  const kategorieId =
    ext.kategorie_id && KAT_IDS.has(ext.kategorie_id) ? ext.kategorie_id : null;
  return {
    haendler: ext.haendler,
    beleg_datum: ext.datum,
    brutto_cents: euroToCents(ext.brutto),
    ust_cents: euroToCents(ext.ust_betrag),
    netto_cents: euroToCents(ext.netto),
    ust_satz: ext.ust_satz,
    rechnungsnummer: ext.rechnungsnummer,
    kategorie_id: kategorieId,
    konfidenz: ext.konfidenz == null ? null : Math.round(ext.konfidenz * 100),
    erkannt: ext as unknown as Record<string, unknown>,
    status: 'zugeordnet',
  };
}

async function buildContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  billingEntityId: string,
): Promise<ReceiptExtractionContext> {
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('company_name, name, vat_id, iban')
    .eq('id', billingEntityId)
    .maybeSingle();
  return {
    firmaName: entity?.company_name || entity?.name || null,
    firmaUstId: entity?.vat_id ?? null,
    firmaIban: entity?.iban ?? null,
    kategorien: KAT_CONTEXT,
  };
}

/** Reads one receipt via KI Vision and stores the extracted fields. */
export async function extractReceiptAction(receiptId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(receiptId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  if (!isReceiptVisionEnabled()) {
    return errorResult('KI-Auslesen ist nicht aktiviert (OPENAI_API_KEY fehlt).');
  }

  const supabase = await createSupabaseServerClient();
  const { data: receipt } = await supabase
    .from('bookkeeping_receipts')
    .select('id, organization_id, billing_entity_id, onedrive_item_id, file_mime')
    .eq('id', receiptId)
    .maybeSingle();
  if (!receipt) return errorResult(de.errors.FORBIDDEN);
  if (!receipt.onedrive_item_id) {
    return errorResult('Beleg hat keine OneDrive-Datei.');
  }

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: receipt.organization_id });

  const file = await downloadItem(receipt.organization_id, receipt.onedrive_item_id);
  if (!file) return errorResult('Beleg konnte nicht aus OneDrive geladen werden.');

  const mime = resolveReceiptMime(file.name, receipt.file_mime || file.mime);
  if (!isReadableReceiptMime(mime)) {
    return errorResult('Dateityp wird nicht unterstützt (nur JPG, PNG oder PDF).');
  }

  const ctx = await buildContext(supabase, receipt.billing_entity_id);
  const ext = await extractReceipt(file.bytes, mime, ctx);
  const update = toReceiptUpdate(ext);
  if (!update) return errorResult('Beleg konnte nicht ausgelesen werden.');

  const { error } = await supabase
    .from('bookkeeping_receipts')
    .update(update)
    .eq('id', receiptId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/finance');
  return successResult('Beleg ausgelesen.');
}

export interface ExtractBatchResult {
  ok: boolean;
  message: string;
  done: number;
  failed: number;
  /** Receipts still un-attempted after this run (drives the client loop). */
  remaining: number;
}

/** Marks a receipt as attempted-but-failed so the drain moves past it. */
async function markFailed(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  id: string,
): Promise<void> {
  await supabase
    .from('bookkeeping_receipts')
    .update({ erkannt: { _extract_failed: true, at: new Date().toISOString() } })
    .eq('id', id);
}

/**
 * Reads a SMALL batch of not-yet-attempted receipts so each call reliably
 * finishes within the serverless time budget. "Attempted" is tracked via the
 * `erkannt` column (set on success AND on failure), so failing receipts can't
 * clog the queue – the drain always makes progress and terminates. The client
 * calls this repeatedly (with a live progress count) until nothing is left.
 *
 * `retryFailed` (sent on the first call of a manual run) clears prior failure
 * markers so a fresh click re-attempts previously-failed receipts.
 */
export async function extractOpenReceiptsAction(
  billingEntityId: string,
  retryFailed = false,
): Promise<ExtractBatchResult> {
  const fail = (message: string): ExtractBatchResult => ({
    ok: false,
    message,
    done: 0,
    failed: 0,
    remaining: 0,
  });

  if (!z.string().uuid().safeParse(billingEntityId).success) {
    return fail(de.errors.VALIDATION);
  }
  if (!isReceiptVisionEnabled()) {
    return fail('KI-Auslesen ist nicht aktiviert (OPENAI_API_KEY fehlt).');
  }

  const supabase = await createSupabaseServerClient();
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('organization_id')
    .eq('id', billingEntityId)
    .maybeSingle();
  if (!entity) return fail(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: entity.organization_id });

  // Fresh manual run: give previously-failed receipts another chance.
  if (retryFailed) {
    await supabase
      .from('bookkeeping_receipts')
      .update({ erkannt: null })
      .eq('billing_entity_id', billingEntityId)
      .eq('erkannt->>_extract_failed', 'true');
  }

  // Small batch + gentle concurrency (avoid 429 rate limits) + a wall-clock
  // budget so one call never hits the function timeout. Each receipt is capped
  // and retried inside extractReceipt.
  const BATCH = 6;
  const CONCURRENCY = 2;
  const BUDGET_MS = 55_000;
  const startedAt = Date.now();

  // "Un-attempted" = erkannt is null. Failures set erkannt (a marker), so they
  // are excluded next round instead of clogging the front of the queue.
  const { data: pending } = await supabase
    .from('bookkeeping_receipts')
    .select('id, organization_id, onedrive_item_id, file_mime')
    .eq('billing_entity_id', billingEntityId)
    .is('erkannt', null)
    .not('onedrive_item_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(BATCH);

  const ctx = await buildContext(supabase, billingEntityId);
  const queue = (pending ?? []).filter((r) => r.onedrive_item_id);
  let done = 0;
  let failed = 0;

  async function extractOne(r: (typeof queue)[number]): Promise<void> {
    if (!r.onedrive_item_id) return;
    const file = await downloadItem(r.organization_id, r.onedrive_item_id);
    if (!file) {
      failed += 1;
      await markFailed(supabase, r.id);
      return;
    }
    const mime = resolveReceiptMime(file.name, r.file_mime || file.mime);
    if (!isReadableReceiptMime(mime)) {
      failed += 1;
      await markFailed(supabase, r.id);
      return;
    }
    const ext = await extractReceipt(file.bytes, mime, ctx);
    const update = toReceiptUpdate(ext);
    if (!update) {
      failed += 1;
      await markFailed(supabase, r.id);
      return;
    }
    const { error } = await supabase
      .from('bookkeeping_receipts')
      .update(update)
      .eq('id', r.id);
    if (error) {
      failed += 1;
      await markFailed(supabase, r.id);
    } else {
      done += 1;
    }
  }

  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    await Promise.all(queue.slice(i, i + CONCURRENCY).map(extractOne));
  }

  // How many are still un-attempted after this run (drives the client loop).
  const { count: remaining } = await supabase
    .from('bookkeeping_receipts')
    .select('id', { count: 'exact', head: true })
    .eq('billing_entity_id', billingEntityId)
    .is('erkannt', null)
    .not('onedrive_item_id', 'is', null);

  revalidatePath('/app/finance');
  return {
    ok: true,
    done,
    failed,
    remaining: remaining ?? 0,
    message: `${done} ausgelesen${failed > 0 ? `, ${failed} fehlgeschlagen` : ''}.`,
  };
}
