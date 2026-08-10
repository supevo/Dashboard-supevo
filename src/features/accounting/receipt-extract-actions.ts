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

/**
 * Reads every not-yet-extracted receipt of a company (brutto still null). Capped
 * per run to keep latency + KI cost bounded – re-run to continue.
 */
export async function extractOpenReceiptsAction(
  billingEntityId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(billingEntityId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  if (!isReceiptVisionEnabled()) {
    return errorResult('KI-Auslesen ist nicht aktiviert (OPENAI_API_KEY fehlt).');
  }

  const supabase = await createSupabaseServerClient();
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('organization_id')
    .eq('id', billingEntityId)
    .maybeSingle();
  if (!entity) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: entity.organization_id });

  // Cap per run to stay within the serverless time budget, but process several
  // receipts in parallel so one run clears most inboxes. Re-run for the rest.
  const BATCH = 45;
  const CONCURRENCY = 5;
  const { data: pending } = await supabase
    .from('bookkeeping_receipts')
    .select('id, organization_id, onedrive_item_id, file_mime')
    .eq('billing_entity_id', billingEntityId)
    .is('brutto_cents', null)
    .not('onedrive_item_id', 'is', null)
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
      return;
    }
    const mime = resolveReceiptMime(file.name, r.file_mime || file.mime);
    if (!isReadableReceiptMime(mime)) {
      failed += 1;
      return;
    }
    const ext = await extractReceipt(file.bytes, mime, ctx);
    const update = toReceiptUpdate(ext);
    if (!update) {
      failed += 1;
      return;
    }
    const { error } = await supabase
      .from('bookkeeping_receipts')
      .update(update)
      .eq('id', r.id);
    if (error) failed += 1;
    else done += 1;
  }

  // Process in parallel chunks to keep wall-time bounded.
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    await Promise.all(queue.slice(i, i + CONCURRENCY).map(extractOne));
  }

  revalidatePath('/app/finance');
  return successResult(
    `${done} Belege ausgelesen${failed > 0 ? `, ${failed} fehlgeschlagen` : ''}.` +
      (pending && pending.length === BATCH ? ' Erneut ausführen für weitere.' : ''),
  );
}
