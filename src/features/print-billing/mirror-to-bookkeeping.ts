import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { resolveClientEntity } from '@/features/billing/invoice-service';
import { ensureSubfolderPath, uploadToFolder } from '@/lib/onedrive/graph';
import { extractReceiptAction } from '@/features/accounting/receipt-extract-actions';
import { logger } from '@/lib/logger';

const MONTH_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/**
 * Spiegelt die ENDrechnung einer Drucksache zusätzlich als Eingangsrechnung in
 * die Buchhaltung: legt einen bookkeeping_receipts-Beleg an (Lieferant + Betrag
 * vorbefüllt), lädt die Datei in den OneDrive-Ausgaben-Ordner der Firma unter
 * Jahr/Monat (damit der normale Scan sie nicht doppelt importiert) und stößt das
 * KI-Auslesen an (füllt Belegdatum → richtiger Monat, USt, Rechnungsnummer).
 *
 * Bewusst best-effort: schlägt irgendetwas fehl (kein OneDrive, keine Rechte,
 * KI aus), bleibt der Drucksachen-Upload erfolgreich – der Beleg existiert dann
 * ggf. mit Vorbelegung und kann später nachgelesen werden. Nie werfen.
 */
export async function mirrorPrintExpenseToReceipt(params: {
  printExpenseId: string;
  orgId: string;
  clientCompanyId: string | null;
  supplier: string | null;
  amountCents: number | null;
  fileName: string;
  fileMime: string;
  bytes: Buffer;
}): Promise<void> {
  try {
    const service = createSupabaseServiceClient();

    // Schon verknüpft? Dann nichts doppelt anlegen.
    const { data: existing } = await service
      .from('print_expenses')
      .select('receipt_id')
      .eq('id', params.printExpenseId)
      .maybeSingle();
    if ((existing as { receipt_id?: string | null } | null)?.receipt_id) return;

    // Firma (billing entity) bestimmen – dieselbe wie bei der Weiterberechnung;
    // resolveClientEntity fällt selbst auf die Standard-Firma zurück.
    let entityId: string | null = null;
    if (params.clientCompanyId) {
      const entity = await resolveClientEntity(
        service,
        params.orgId,
        params.clientCompanyId,
      );
      entityId = entity?.id ?? null;
    } else {
      const { data: def } = await service
        .from('billing_entities')
        .select('id')
        .eq('organization_id', params.orgId)
        .eq('is_default', true)
        .maybeSingle();
      entityId = def?.id ?? null;
    }
    if (!entityId) {
      logger.warn('print_mirror.no_entity', { orgId: params.orgId });
      return;
    }

    // Ausgaben-OneDrive-Ordner der Firma.
    const { data: profile } = await service
      .from('accounting_profiles')
      .select('onedrive_ausgaben_folder_id')
      .eq('billing_entity_id', entityId)
      .maybeSingle();
    const ausgabenRoot =
      (profile as { onedrive_ausgaben_folder_id?: string | null } | null)
        ?.onedrive_ausgaben_folder_id ?? null;

    // Upload-Monat als Vorbelegung (das echte Belegdatum setzt das KI-Auslesen).
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const mm = String(month).padStart(2, '0');
    const monthFolder = `${mm}. ${MONTH_NAMES_DE[month - 1]}`;
    const belegDatum = `${year}-${mm}-01`;

    let onedriveItemId: string | null = null;
    if (ausgabenRoot) {
      const folderId = await ensureSubfolderPath(params.orgId, ausgabenRoot, [
        String(year),
        monthFolder,
      ]);
      if (folderId) {
        onedriveItemId = await uploadToFolder(
          params.orgId,
          folderId,
          params.fileName,
          params.bytes,
          params.fileMime,
        );
      }
    }

    // Beleg (Eingangsrechnung) anlegen – vorbefüllt aus der Drucksache.
    const { data: receipt, error } = await service
      .from('bookkeeping_receipts')
      .insert({
        organization_id: params.orgId,
        billing_entity_id: entityId,
        kind: 'ausgabe',
        source: onedriveItemId ? 'onedrive' : 'upload',
        onedrive_item_id: onedriveItemId,
        file_name: params.fileName,
        file_mime: params.fileMime,
        brutto_cents: params.amountCents,
        haendler: params.supplier,
        beleg_datum: belegDatum,
      } as never)
      .select('id')
      .maybeSingle();
    if (error || !receipt) {
      logger.warn('print_mirror.receipt_insert_failed', {
        error: error?.message,
      });
      return;
    }
    const receiptId = (receipt as { id: string }).id;

    // Verknüpfen (resilient: Spalte receipt_id fehlt evtl., Migration 0197).
    const { error: linkErr } = await service
      .from('print_expenses')
      .update({ receipt_id: receiptId } as never)
      .eq('id', params.printExpenseId);
    if (linkErr) {
      logger.warn('print_mirror.link_failed', { error: linkErr.message });
    }

    // KI-Auslesen anstoßen (lädt die Datei aus OneDrive). Darf fehlschlagen –
    // der Beleg bleibt mit Lieferant/Betrag/Upload-Monat bestehen.
    if (onedriveItemId) {
      try {
        await extractReceiptAction(receiptId);
      } catch {
        /* best effort – später per „Belege neu prüfen"/Auslesen nachholbar */
      }
    }
  } catch (e) {
    logger.warn('print_mirror.failed', {
      error: e instanceof Error ? e.message : 'unknown',
    });
  }
}
