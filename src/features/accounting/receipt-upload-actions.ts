'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { uploadToFolder, ensureSubfolderPath } from '@/lib/onedrive/graph';
import { sanitizeFileName } from '@/lib/files/validation';
import {
  extractReceipt,
  isReceiptVisionEnabled,
  resolveReceiptMime,
  isReadableReceiptMime,
  type ReceiptExtraction,
} from '@/lib/ai/vision';
import { KATEGORIEN } from '@/features/accounting/categories';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const MAX_BYTES = 25 * 1024 * 1024;
const KAT_IDS = new Set(KATEGORIEN.map((k) => k.id));
const KAT_CONTEXT = KATEGORIEN.map((k) => ({ id: k.id, label: k.label, art: k.art }));
const MONTHS_LONG = [
  '01 Januar', '02 Februar', '03 März', '04 April', '05 Mai', '06 Juni',
  '07 Juli', '08 August', '09 September', '10 Oktober', '11 November', '12 Dezember',
];

/** Year/month subfolder segments from a receipt date (falls back to today). */
function folderSegments(datum: string | null): string[] {
  let d = new Date();
  if (datum && /^\d{4}-\d{2}-\d{2}/.test(datum)) {
    const parsed = new Date(datum);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  return [String(d.getFullYear()), MONTHS_LONG[d.getMonth()]!];
}

/**
 * Uploads a receipt to the company's OneDrive folder and registers it. The file
 * is read by the KI first (if enabled) so it can be filed into the correct
 * <Jahr>/<Monat> subfolder – which is created automatically if missing.
 */
export async function uploadReceiptAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const billingEntityId = formData.get('billingEntityId');
  if (!z.string().uuid().safeParse(billingEntityId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const entityId = billingEntityId as string;
  const kind = formData.get('kind') === 'einnahme' ? 'einnahme' : 'ausgabe';

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return errorResult('Bitte eine Beleg-Datei auswählen.');
  }
  if (file.size > MAX_BYTES) return errorResult('Datei ist zu groß (max. 25 MB).');

  const supabase = await createSupabaseServerClient();
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('organization_id, company_name, name, vat_id, iban')
    .eq('id', entityId)
    .maybeSingle();
  if (!entity) return errorResult(de.errors.FORBIDDEN);
  const orgId = entity.organization_id;

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  const { data: profile } = await supabase
    .from('accounting_profiles')
    .select('onedrive_einnahmen_folder_id, onedrive_ausgaben_folder_id')
    .eq('billing_entity_id', entityId)
    .maybeSingle();
  const rootFolderId =
    kind === 'einnahme'
      ? profile?.onedrive_einnahmen_folder_id
      : profile?.onedrive_ausgaben_folder_id;
  if (!rootFolderId) {
    return errorResult(
      `Kein ${kind === 'einnahme' ? 'Einnahmen' : 'Ausgaben'}-Ordner verknüpft (Tab „Firmen“).`,
    );
  }

  const name = sanitizeFileName(file.name);
  const mime = resolveReceiptMime(name, file.type);
  const bytes = Buffer.from(await file.arrayBuffer());

  // Read first (best-effort) so we can file it by the real receipt date.
  let ext: ReceiptExtraction | null = null;
  if (isReceiptVisionEnabled() && isReadableReceiptMime(mime)) {
    ext = await extractReceipt(bytes, mime, {
      firmaName: entity.company_name || entity.name || null,
      firmaUstId: entity.vat_id ?? null,
      firmaIban: entity.iban ?? null,
      kategorien: KAT_CONTEXT,
    });
  }

  // Ensure <root>/<Jahr>/<Monat> and upload there (fall back to root on failure).
  const targetFolderId =
    (await ensureSubfolderPath(orgId, rootFolderId, folderSegments(ext?.datum ?? null))) ??
    rootFolderId;

  const itemId = await uploadToFolder(orgId, targetFolderId, name, bytes, mime);
  if (!itemId) return errorResult('Upload nach OneDrive fehlgeschlagen.');

  const kategorieId =
    ext?.kategorie_id && KAT_IDS.has(ext.kategorie_id) ? ext.kategorie_id : null;
  const { error } = await supabase.from('bookkeeping_receipts').insert({
    organization_id: orgId,
    billing_entity_id: entityId,
    kind,
    source: 'upload',
    onedrive_item_id: itemId,
    file_name: name,
    file_mime: mime,
    file_size: file.size,
    created_by: user.id,
    ...(ext
      ? {
          haendler: ext.haendler,
          beleg_datum: ext.datum,
          brutto_cents: ext.brutto == null ? null : Math.round(ext.brutto * 100),
          ust_cents: ext.ust_betrag == null ? null : Math.round(ext.ust_betrag * 100),
          netto_cents: ext.netto == null ? null : Math.round(ext.netto * 100),
          ust_satz: ext.ust_satz,
          rechnungsnummer: ext.rechnungsnummer,
          kategorie_id: kategorieId,
          konfidenz: ext.konfidenz == null ? null : Math.round(ext.konfidenz * 100),
          erkannt: ext as unknown as Record<string, unknown>,
          status: 'zugeordnet',
        }
      : {}),
  });
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/finance');
  return successResult(
    ext ? 'Beleg hochgeladen und ausgelesen.' : 'Beleg hochgeladen.',
  );
}
