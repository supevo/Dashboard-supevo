'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { listFolder } from '@/lib/onedrive/graph';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const importSchema = z.object({
  billingEntityId: z.string().uuid(),
  kind: z.enum(['einnahmen', 'ausgaben']),
});

/**
 * Scans a company's linked OneDrive folder (Einnahmen or Ausgaben) and imports
 * every file that is not already known as a bookkeeping receipt. Idempotent: the
 * OneDrive item id is the dedup key, so the same folder can be re-scanned to pull
 * in newly added files without creating duplicates. Extraction (händler, betrag,
 * USt …) happens later via KI/OCR; here we only register the documents.
 */
export async function importOneDriveReceiptsAction(input: {
  billingEntityId: string;
  kind: 'einnahmen' | 'ausgaben';
}): Promise<ActionResult> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { billingEntityId, kind } = parsed.data;

  const supabase = await createSupabaseServerClient();

  // Load the entity (org + folder) via RLS – this also gates visibility.
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('organization_id')
    .eq('id', billingEntityId)
    .maybeSingle();
  if (!entity) return errorResult(de.errors.FORBIDDEN);
  const orgId = entity.organization_id;

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  const { data: profile } = await supabase
    .from('accounting_profiles')
    .select(
      'onedrive_einnahmen_folder_id, onedrive_einnahmen_folder_path, onedrive_ausgaben_folder_id, onedrive_ausgaben_folder_path',
    )
    .eq('billing_entity_id', billingEntityId)
    .maybeSingle();

  const folderId =
    kind === 'einnahmen'
      ? profile?.onedrive_einnahmen_folder_id
      : profile?.onedrive_ausgaben_folder_id;
  const folderPath =
    kind === 'einnahmen'
      ? profile?.onedrive_einnahmen_folder_path
      : profile?.onedrive_ausgaben_folder_path;
  if (!folderId) {
    return errorResult(
      `Kein ${kind === 'einnahmen' ? 'Einnahmen' : 'Ausgaben'}-Ordner verknüpft. Bitte zuerst im Tab „Firmen" verbinden.`,
    );
  }

  // List the folder (non-recursive). OneDrive connection is per organization.
  const items = await listFolder(orgId, folderId);
  if (items === null) {
    return errorResult(
      'OneDrive nicht erreichbar. Ist das Konto noch verbunden?',
    );
  }
  const files = items.filter((i) => !i.isFolder);

  // Existing receipts of this company → dedup by OneDrive item id.
  const { data: known } = await supabase
    .from('bookkeeping_receipts')
    .select('onedrive_item_id')
    .eq('billing_entity_id', billingEntityId)
    .not('onedrive_item_id', 'is', null);
  const knownIds = new Set((known ?? []).map((r) => r.onedrive_item_id));

  const receiptKind = kind === 'einnahmen' ? 'einnahme' : 'ausgabe';
  const toInsert = files
    .filter((f) => !knownIds.has(f.id))
    .map((f) => ({
      organization_id: orgId,
      billing_entity_id: billingEntityId,
      kind: receiptKind,
      source: 'onedrive',
      onedrive_item_id: f.id,
      file_name: f.name,
      file_size: f.size,
      created_by: user.id,
    }));

  let imported = 0;
  let errors = 0;
  if (toInsert.length > 0) {
    const { error, count } = await supabase
      .from('bookkeeping_receipts')
      .insert(toInsert, { count: 'exact' });
    if (error) errors = toInsert.length;
    else imported = count ?? toInsert.length;
  }
  const skipped = files.length - imported - errors;

  await supabase.from('bookkeeping_import_log').insert({
    organization_id: orgId,
    billing_entity_id: billingEntityId,
    kind: receiptKind,
    source: folderPath || folderId,
    imported_count: imported,
    skipped_count: skipped < 0 ? 0 : skipped,
    error_count: errors,
    created_by: user.id,
  });

  revalidatePath('/app/finance');
  if (errors > 0) {
    return errorResult(
      `${imported} importiert, ${errors} fehlgeschlagen. Bitte erneut versuchen.`,
    );
  }
  return successResult(
    imported > 0
      ? `${imported} neue Belege importiert (${skipped} bereits vorhanden).`
      : `Keine neuen Belege – alle ${files.length} bereits importiert.`,
  );
}
