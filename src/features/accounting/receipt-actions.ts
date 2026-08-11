'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { listFolder, listFolderFilesRecursive } from '@/lib/onedrive/graph';
import { resolveReceiptMime } from '@/lib/ai/vision';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const importSchema = z.object({
  billingEntityId: z.string().uuid(),
  kind: z.enum(['einnahmen', 'ausgaben']),
  // Optional: nur EINEN direkten Unterordner des verknüpften Ordners importieren.
  subfolderId: z.string().min(1).max(1024).optional(),
});

const subfoldersSchema = z.object({
  billingEntityId: z.string().uuid(),
  kind: z.enum(['einnahmen', 'ausgaben']),
});

/** Resolves the linked OneDrive folder id/path for a company + kind. */
async function linkedFolder(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  billingEntityId: string,
  kind: 'einnahmen' | 'ausgaben',
): Promise<{ id: string | null; path: string | null }> {
  const { data: profile } = await supabase
    .from('accounting_profiles')
    .select(
      'onedrive_einnahmen_folder_id, onedrive_einnahmen_folder_path, onedrive_ausgaben_folder_id, onedrive_ausgaben_folder_path',
    )
    .eq('billing_entity_id', billingEntityId)
    .maybeSingle();
  return kind === 'einnahmen'
    ? {
        id: profile?.onedrive_einnahmen_folder_id ?? null,
        path: profile?.onedrive_einnahmen_folder_path ?? null,
      }
    : {
        id: profile?.onedrive_ausgaben_folder_id ?? null,
        path: profile?.onedrive_ausgaben_folder_path ?? null,
      };
}

/**
 * Lists the immediate subfolders of a company's linked Einnahmen/Ausgaben folder,
 * so the Belege import can be narrowed to a single subfolder (e.g. one month).
 */
export async function listReceiptSubfoldersAction(input: {
  billingEntityId: string;
  kind: 'einnahmen' | 'ausgaben';
}): Promise<{
  ok: boolean;
  folders?: { id: string; name: string; childCount: number | null }[];
  error?: string;
}> {
  const parsed = subfoldersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: de.errors.VALIDATION };
  const { billingEntityId, kind } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('organization_id')
    .eq('id', billingEntityId)
    .maybeSingle();
  if (!entity) return { ok: false, error: de.errors.FORBIDDEN };
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: entity.organization_id });

  const folder = await linkedFolder(supabase, billingEntityId, kind);
  if (!folder.id) return { ok: false, error: 'Kein Ordner verknüpft.' };

  const children = await listFolder(entity.organization_id, folder.id);
  if (children === null) return { ok: false, error: 'OneDrive nicht erreichbar.' };
  const folders = children
    .filter((c) => c.isFolder)
    .map((c) => ({ id: c.id, name: c.name, childCount: c.childCount }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { ok: true, folders };
}

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
  subfolderId?: string;
}): Promise<ActionResult> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { billingEntityId, kind, subfolderId } = parsed.data;

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

  const folder = await linkedFolder(supabase, billingEntityId, kind);
  const folderId = folder.id;
  let folderPath = folder.path;
  if (!folderId) {
    return errorResult(
      `Kein ${kind === 'einnahmen' ? 'Einnahmen' : 'Ausgaben'}-Ordner verknüpft. Bitte zuerst im Tab „Firmen" verbinden.`,
    );
  }

  // Optional: nur einen direkten Unterordner importieren. Der Unterordner muss
  // wirklich unter dem verknüpften Ordner liegen (sonst kein Import von
  // beliebigen OneDrive-Ordnern).
  let scanRootId = folderId;
  if (subfolderId) {
    const children = await listFolder(orgId, folderId);
    if (children === null) {
      return errorResult('OneDrive nicht erreichbar. Ist das Konto noch verbunden?');
    }
    const sub = children.find((c) => c.isFolder && c.id === subfolderId);
    if (!sub) {
      return errorResult('Unterordner nicht gefunden. Bitte Liste neu laden.');
    }
    scanRootId = subfolderId;
    folderPath = `${folderPath ?? ''}/${sub.name}`.replace(/^\/+/, '');
  }

  // List the folder recursively (Belege liegen oft in Jahr/Monat-Unterordnern).
  const files = await listFolderFilesRecursive(orgId, scanRootId);
  if (files === null) {
    return errorResult(
      'OneDrive nicht erreichbar. Ist das Konto noch verbunden?',
    );
  }

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
      file_mime: resolveReceiptMime(f.name, null),
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
    { imported },
  );
}

const setKindSchema = z.object({
  receiptId: z.string().uuid(),
  kind: z.enum(['einnahme', 'ausgabe']),
});

/** Manually switch a receipt between Einnahme and Ausgabe. */
export async function setReceiptKindAction(input: unknown): Promise<ActionResult> {
  const parsed = setKindSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const supabase = await createSupabaseServerClient();
  const { data: receipt } = await supabase
    .from('bookkeeping_receipts')
    .select('organization_id')
    .eq('id', parsed.data.receiptId)
    .maybeSingle();
  if (!receipt) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: receipt.organization_id });

  const { error } = await supabase
    .from('bookkeeping_receipts')
    .update({ kind: parsed.data.kind })
    .eq('id', parsed.data.receiptId);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Art geändert.');
}
