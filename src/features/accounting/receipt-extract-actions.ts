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
  type AiCallUsage,
} from '@/lib/ai/vision';
import { recordAiUsage } from '@/lib/ai/usage';
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
  // Content-based Einnahme/Ausgabe: the KI's detected direction wins over
  // whichever import folder/button the file happened to come in through.
  //   richtung 'ausgang' = Ausgangsrechnung (eigene Firma stellt Rechnung) → Einnahme
  //   richtung 'eingang' = Eingangsrechnung (Lieferant stellt Rechnung)    → Ausgabe
  const kind =
    ext.richtung === 'ausgang'
      ? 'einnahme'
      : ext.richtung === 'eingang'
        ? 'ausgabe'
        : undefined;
  return {
    haendler: ext.haendler,
    beleg_datum: ext.datum,
    brutto_cents: euroToCents(ext.brutto),
    ust_cents: euroToCents(ext.ust_betrag),
    netto_cents: euroToCents(ext.netto),
    ust_satz: ext.ust_satz,
    rechnungsnummer: ext.rechnungsnummer,
    waehrung: ext.waehrung ? ext.waehrung.trim().toUpperCase() : null,
    konto_ref: ext.konto_ref?.trim() || null,
    kategorie_id: kategorieId,
    konfidenz: ext.konfidenz == null ? null : Math.round(ext.konfidenz * 100),
    erkannt: ext as unknown as Record<string, unknown>,
    extract_failed_at: null,
    ...(kind ? { kind } : {}),
    // Status NICHT auf 'zugeordnet' setzen – ausgelesen heißt nur "erkannt",
    // zugeordnet wird ein Beleg erst beim Abgleich (linkReceipt).
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
  let usage: AiCallUsage | null = null;
  const ext = await extractReceipt(file.bytes, mime, ctx, (u) => {
    usage = u;
  });
  if (usage) {
    await recordAiUsage(supabase, {
      orgId: receipt.organization_id,
      purpose: 'receipt',
      usage,
    });
  }
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

type Db = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Marks a receipt as failed so the drain skips it (recoverable via retry). */
async function markFailed(supabase: Db, id: string): Promise<void> {
  await supabase
    .from('bookkeeping_receipts')
    .update({ extract_failed_at: new Date().toISOString() })
    .eq('id', id);
}

/**
 * Reads a SMALL batch of receipts that still need extraction, so each call
 * finishes within the serverless time budget. State is explicit:
 *   offen      = brutto_cents null AND extract_failed_at null AND OneDrive-Datei
 *   erledigt   = brutto_cents gesetzt
 *   fehlgeschlagen = extract_failed_at gesetzt (übersprungen, per Retry erneut)
 * The client calls this repeatedly (with a live count) until nothing is open.
 * `retryFailed` (first call of a manual run) clears failure marks so a fresh
 * click re-attempts previously-failed receipts.
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
      .update({ extract_failed_at: null })
      .eq('billing_entity_id', billingEntityId)
      .not('extract_failed_at', 'is', null);
  }

  const BATCH = 6;
  const CONCURRENCY = 2;
  const BUDGET_MS = 55_000;
  const startedAt = Date.now();

  // Open = not yet read, not failed, and has a OneDrive file to fetch.
  const { data: pending, error: pendErr } = await supabase
    .from('bookkeeping_receipts')
    .select('id, organization_id, onedrive_item_id, file_mime')
    .eq('billing_entity_id', billingEntityId)
    .is('brutto_cents', null)
    .is('extract_failed_at', null)
    .not('onedrive_item_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(BATCH);
  if (pendErr) {
    return fail(`Abfrage fehlgeschlagen: ${pendErr.message}`);
  }

  const ctx = await buildContext(supabase, billingEntityId);
  const queue = (pending ?? []).filter((r) => r.onedrive_item_id);
  let done = 0;
  let failDownload = 0;
  let failMime = 0;
  let failExtract = 0;

  async function extractOne(r: (typeof queue)[number]): Promise<void> {
    if (!r.onedrive_item_id) return;
    const file = await downloadItem(r.organization_id, r.onedrive_item_id);
    if (!file) {
      failDownload += 1;
      await markFailed(supabase, r.id);
      return;
    }
    const mime = resolveReceiptMime(file.name, r.file_mime || file.mime);
    if (!isReadableReceiptMime(mime)) {
      failMime += 1;
      await markFailed(supabase, r.id);
      return;
    }
    let usage: AiCallUsage | null = null;
    const ext = await extractReceipt(file.bytes, mime, ctx, (u) => {
      usage = u;
    });
    if (usage) {
      await recordAiUsage(supabase, {
        orgId: r.organization_id,
        purpose: 'receipt',
        usage,
      });
    }
    const update = toReceiptUpdate(ext);
    if (!update) {
      failExtract += 1;
      await markFailed(supabase, r.id);
      return;
    }
    const { error } = await supabase
      .from('bookkeeping_receipts')
      .update(update)
      .eq('id', r.id);
    if (error) {
      failExtract += 1;
      await markFailed(supabase, r.id);
    } else {
      done += 1;
    }
  }

  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    await Promise.all(queue.slice(i, i + CONCURRENCY).map(extractOne));
  }

  const { count: remaining } = await supabase
    .from('bookkeeping_receipts')
    .select('id', { count: 'exact', head: true })
    .eq('billing_entity_id', billingEntityId)
    .is('brutto_cents', null)
    .is('extract_failed_at', null)
    .not('onedrive_item_id', 'is', null);

  const failed = failDownload + failMime + failExtract;
  const reasons: string[] = [];
  if (failDownload) reasons.push(`${failDownload}× Download`);
  if (failMime) reasons.push(`${failMime}× Dateiformat`);
  if (failExtract) reasons.push(`${failExtract}× KI-Lesung`);

  // Nothing was open and nothing processed → say why (e.g. import left receipts
  // without a OneDrive file, so they can never be read).
  let note = '';
  if (done === 0 && failed === 0 && (remaining ?? 0) === 0) {
    const { count: ohneDatei } = await supabase
      .from('bookkeeping_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('billing_entity_id', billingEntityId)
      .is('brutto_cents', null)
      .is('onedrive_item_id', null);
    if ((ohneDatei ?? 0) > 0) {
      note = ` ${ohneDatei} Belege haben keine OneDrive-Datei hinterlegt (Import unvollständig) – bitte neu importieren.`;
    } else {
      note = ' Alle Belege sind bereits ausgelesen.';
    }
  }

  revalidatePath('/app/finance');
  return {
    ok: true,
    done,
    failed,
    remaining: remaining ?? 0,
    message:
      `${done} ausgelesen` +
      (failed > 0 ? `, ${failed} übersprungen (${reasons.join(', ')})` : '') +
      '.' +
      note,
  };
}
