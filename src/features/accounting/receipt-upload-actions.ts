'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { uploadToFolder } from '@/lib/onedrive/graph';
import { sanitizeFileName } from '@/lib/files/validation';
import {
  extractReceipt,
  isReceiptVisionEnabled,
  resolveReceiptMime,
  isReadableReceiptMime,
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

/**
 * Uploads a receipt file to the company's OneDrive folder (Ausgaben by default),
 * registers it as a bookkeeping receipt and – if KI is enabled – reads it right
 * away. OneDrive stays the source of truth for the file.
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
  const folderId =
    kind === 'einnahme'
      ? profile?.onedrive_einnahmen_folder_id
      : profile?.onedrive_ausgaben_folder_id;
  if (!folderId) {
    return errorResult(
      `Kein ${kind === 'einnahme' ? 'Einnahmen' : 'Ausgaben'}-Ordner verknüpft (Tab „Firmen“).`,
    );
  }

  const name = sanitizeFileName(file.name);
  const mime = resolveReceiptMime(name, file.type);
  const bytes = Buffer.from(await file.arrayBuffer());

  const itemId = await uploadToFolder(orgId, folderId, name, bytes, mime);
  if (!itemId) {
    return errorResult('Upload nach OneDrive fehlgeschlagen.');
  }

  const { data: created, error } = await supabase
    .from('bookkeeping_receipts')
    .insert({
      organization_id: orgId,
      billing_entity_id: entityId,
      kind,
      source: 'upload',
      onedrive_item_id: itemId,
      file_name: name,
      file_mime: mime,
      file_size: file.size,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle();
  if (error || !created) return errorResult(de.errors.INTERNAL);

  // Best-effort KI extraction right away.
  let read = false;
  if (isReceiptVisionEnabled() && isReadableReceiptMime(mime)) {
    const ext = await extractReceipt(bytes, mime, {
      firmaName: entity.company_name || entity.name || null,
      firmaUstId: entity.vat_id ?? null,
      firmaIban: entity.iban ?? null,
      kategorien: KAT_CONTEXT,
    });
    if (ext) {
      const kategorieId =
        ext.kategorie_id && KAT_IDS.has(ext.kategorie_id) ? ext.kategorie_id : null;
      await supabase
        .from('bookkeeping_receipts')
        .update({
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
        })
        .eq('id', created.id);
      read = true;
    }
  }

  revalidatePath('/app/finance');
  return successResult(
    read ? 'Beleg hochgeladen und ausgelesen.' : 'Beleg hochgeladen.',
  );
}
