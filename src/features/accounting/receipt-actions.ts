'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import { requireUser, authorize } from '@/lib/authz/authorize';
import {
  listFolder,
  listFolderFilesRecursive,
  getItemMeta,
} from '@/lib/onedrive/graph';
import { resolveReceiptMime } from '@/lib/ai/vision';
import {
  folderMonthDate,
  folderYear,
} from '@/features/accounting/folder-month';

// Belege werden erst ab diesem Jahr importiert; ältere Ordner (2025 und davor)
// bleiben vorerst ausgeklammert.
const MIN_IMPORT_YEAR = 2026;
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
  // Für die Navigation: Unterordner DIESES Ordners auflisten (sonst der
  // verknüpfte Hauptordner).
  folderId: z.string().min(1).max(1024).optional(),
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
  folderId?: string;
}): Promise<{
  ok: boolean;
  folders?: { id: string; name: string; childCount: number | null }[];
  error?: string;
}> {
  const parsed = subfoldersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: de.errors.VALIDATION };
  const { billingEntityId, kind, folderId } = parsed.data;

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

  // Ohne folderId: der verknüpfte Hauptordner. Mit folderId: dessen Unterordner
  // (für die Navigation in tiefer verschachtelten Strukturen).
  const target = folderId ?? folder.id;
  const children = await listFolder(entity.organization_id, target);
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

  // Optional: nur einen (evtl. tief verschachtelten) Unterordner importieren.
  // Existenz wird über die Metadaten geprüft; der verbundene Drive gehört der
  // Organisation (Super-Admin-only).
  let scanRootId = folderId;
  if (subfolderId) {
    const meta = await getItemMeta(orgId, subfolderId);
    if (!meta) {
      return errorResult('Ordner nicht gefunden. Bitte Liste neu laden.');
    }
    scanRootId = subfolderId;
    folderPath = `${folderPath ?? ''}/${meta.name}`.replace(/^\/+/, '');
  }

  // List the folder recursively (Belege liegen oft in Jahr/Monat-Unterordnern).
  const scanned = await listFolderFilesRecursive(orgId, scanRootId, {
    rootPath: folderPath ?? '',
  });
  if (scanned === null) {
    return errorResult(
      'OneDrive nicht erreichbar. Ist das Konto noch verbunden?',
    );
  }
  // Nur ab MIN_IMPORT_YEAR importieren; ältere Jahresordner (2025 und davor)
  // ausklammern. Dateien ohne erkennbares Jahr bleiben drin (kein Fehlausschluss).
  const files = scanned.filter((f) => {
    const y = folderYear(f.parentPath);
    return y == null || y >= MIN_IMPORT_YEAR;
  });

  const receiptKind = kind === 'einnahmen' ? 'einnahme' : 'ausgabe';

  // Existing receipts of this kind → dedup by OneDrive item id.
  const { data: known } = await supabase
    .from('bookkeeping_receipts')
    .select('id, onedrive_item_id, beleg_datum')
    .eq('billing_entity_id', billingEntityId)
    .eq('kind', receiptKind)
    .not('onedrive_item_id', 'is', null);
  const knownIds = new Set((known ?? []).map((r) => r.onedrive_item_id));

  // OneDrive-Datei-id → Monatsdatum aus dem Ordner (z. B. "2026/08. August").
  const fileDateById = new Map<string, string>();
  for (const f of files) {
    const d = folderMonthDate(f.parentPath);
    if (d) fileDateById.set(f.id, d);
  }

  // Sync: Belege, deren OneDrive-Datei nicht mehr existiert, entfernen – aber nur
  // beim vollständigen Scan (kein einzelner Unterordner), sonst würde man Belege
  // aus anderen Unterordnern löschen. Löscht nur den DB-Datensatz. Bewusst gegen
  // den UNGEFILTERTEN Scan (scanned) geprüft: der Jahresfilter blockiert nur neue
  // Importe, löscht aber keine bereits vorhandenen 2025-Belege ungewollt mit.
  let removed = 0;
  if (!subfolderId) {
    const fileIds = new Set(scanned.map((f) => f.id));
    const staleIds = (known ?? [])
      .filter((r) => r.onedrive_item_id && !fileIds.has(r.onedrive_item_id))
      .map((r) => r.id);
    if (staleIds.length > 0) {
      const { error: delErr, count } = await supabase
        .from('bookkeeping_receipts')
        .delete({ count: 'exact' })
        .in('id', staleIds);
      if (!delErr) removed = count ?? staleIds.length;
    }
  }

  // Bereits importierte, aber noch NICHT ausgelesene (undatierte) Belege
  // nachträglich dem Ordner-Monat zuordnen – so „einsortiert" ein erneuter
  // Import Alt-Belege, ohne dass man sie löschen und neu importieren muss.
  // Nur undatierte werden angefasst (ausgelesene behalten ihr echtes Datum).
  let dated = 0;
  const byDate = new Map<string, string[]>();
  for (const r of known ?? []) {
    if (r.beleg_datum || !r.onedrive_item_id) continue;
    const d = fileDateById.get(r.onedrive_item_id);
    if (!d) continue;
    const arr = byDate.get(d) ?? [];
    arr.push(r.onedrive_item_id);
    byDate.set(d, arr);
  }
  for (const [d, ids] of byDate) {
    const { count } = await supabase
      .from('bookkeeping_receipts')
      .update({ beleg_datum: d } as never, { count: 'exact' })
      .eq('billing_entity_id', billingEntityId)
      .in('onedrive_item_id', ids)
      .is('beleg_datum', null);
    dated += count ?? 0;
  }

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
      // Monat aus dem OneDrive-Ordner vorbelegen; die KI überschreibt das später
      // mit dem echten Rechnungsdatum beim Auslesen.
      beleg_datum: folderMonthDate(f.parentPath),
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
  const removedNote =
    removed > 0 ? ` ${removed} in OneDrive gelöschte entfernt.` : '';
  const datedNote =
    dated > 0 ? ` ${dated} vorhandene dem Ordner-Monat zugeordnet.` : '';
  if (errors > 0) {
    return errorResult(
      `${imported} importiert, ${errors} fehlgeschlagen. Bitte erneut versuchen.`,
    );
  }
  return successResult(
    (imported > 0
      ? `${imported} neue Belege importiert (${skipped} bereits vorhanden).`
      : `Keine neuen Belege – alle ${files.length} bereits importiert.`) +
      datedNote +
      removedNote,
    { imported },
  );
}

const updateFieldsSchema = z.object({
  receiptId: z.string().uuid(),
  haendler: z.string().trim().max(200).nullable().optional(),
  belegDatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  bruttoCents: z.number().int().min(0).max(1_000_000_00).nullable().optional(),
  waehrung: z.string().trim().max(8).nullable().optional(),
});

/**
 * Manually correct a receipt's extracted values (Händler, Belegdatum,
 * Bruttobetrag) when the KI read them wrong. Setting a Bruttobetrag also clears
 * a previous Lesefehler, so the receipt becomes matchable in the Abgleich.
 */
export async function updateReceiptFieldsAction(input: unknown): Promise<ActionResult> {
  const parsed = updateFieldsSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { receiptId, haendler, belegDatum, bruttoCents, waehrung } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: receipt } = await supabase
    .from('bookkeeping_receipts')
    .select('organization_id')
    .eq('id', receiptId)
    .maybeSingle();
  if (!receipt) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: receipt.organization_id });

  const patch: Database['public']['Tables']['bookkeeping_receipts']['Update'] =
    {};
  if (haendler !== undefined) patch.haendler = haendler || null;
  if (belegDatum !== undefined) patch.beleg_datum = belegDatum;
  if (bruttoCents !== undefined) {
    patch.brutto_cents = bruttoCents;
    // Ein manuell gesetzter Betrag hebt einen früheren Lesefehler auf.
    if (bruttoCents != null) patch.extract_failed_at = null;
  }
  if (waehrung !== undefined) {
    patch.waehrung = waehrung ? waehrung.toUpperCase() : null;
  }
  if (Object.keys(patch).length === 0) return successResult('Nichts geändert.');

  const { error } = await supabase
    .from('bookkeeping_receipts')
    .update(patch)
    .eq('id', receiptId);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Beleg aktualisiert.');
}

/**
 * Löscht einen Beleg-Datensatz (z. B. eine Alt-/Test-Leiche oder eine Dublette
 * aus mehrfachem Hochladen). Verknüpfungen lösen sich automatisch (tx.beleg_id →
 * null, tx_receipts → cascade). Die Datei in OneDrive bleibt unangetastet.
 */
export async function deleteReceiptAction(receiptId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(receiptId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const { data: receipt } = await supabase
    .from('bookkeeping_receipts')
    .select('organization_id')
    .eq('id', receiptId)
    .maybeSingle();
  if (!receipt) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: receipt.organization_id });

  const { error } = await supabase
    .from('bookkeeping_receipts')
    .delete()
    .eq('id', receiptId);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Beleg gelöscht.');
}

const bulkDeleteSchema = z.object({
  billingEntityId: z.string().uuid(),
  kind: z.enum(['einnahme', 'ausgabe']).optional(),
});

/**
 * Sammel-Löschung der versehentlich importierten, noch NICHT ausgelesenen
 * OneDrive-Belege (source='onedrive', ohne Datum) eines Rechnungsstellers.
 * Bereits ausgelesene, zugeordnete oder manuell hochgeladene Belege bleiben
 * unangetastet – ebenso die Dateien in OneDrive selbst. Für das Aufräumen nach
 * einem falschen „aus Ausgaben importieren".
 */
export async function bulkDeleteUnreadOneDriveReceiptsAction(input: {
  billingEntityId: string;
  kind?: 'einnahme' | 'ausgabe';
}): Promise<ActionResult> {
  const parsed = bulkDeleteSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const supabase = await createSupabaseServerClient();
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('organization_id')
    .eq('id', parsed.data.billingEntityId)
    .maybeSingle();
  if (!entity) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: entity.organization_id });

  let q = supabase
    .from('bookkeeping_receipts')
    .delete({ count: 'exact' })
    .eq('billing_entity_id', parsed.data.billingEntityId)
    .eq('source', 'onedrive')
    .is('beleg_datum', null);
  if (parsed.data.kind) q = q.eq('kind', parsed.data.kind);
  const { error, count } = await q;
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/finance');
  return successResult(
    `${count ?? 0} nicht ausgelesene OneDrive-Belege gelöscht.`,
    { count: count ?? 0 },
  );
}

/**
 * Hebt die Zuordnung eines Belegs auf: löst die Verknüpfung(en) zur Bankbuchung
 * (beleg_id / Beleg-Sammlung) und setzt den Beleg auf „offen" zurück, damit der
 * Abgleich ihn erneut anbieten kann. Für falsch gebundene Belege.
 */
export async function unlinkReceiptAction(receiptId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(receiptId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const { data: receipt } = await supabase
    .from('bookkeeping_receipts')
    .select('organization_id')
    .eq('id', receiptId)
    .maybeSingle();
  if (!receipt) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: receipt.organization_id });

  await supabase
    .from('bookkeeping_transactions')
    .update({ beleg_id: null })
    .eq('beleg_id', receiptId);
  await supabase
    .from('bookkeeping_tx_receipts')
    .delete()
    .eq('receipt_id', receiptId);
  const { error } = await supabase
    .from('bookkeeping_receipts')
    .update({ status: 'offen' })
    .eq('id', receiptId);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Zuordnung aufgehoben.');
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
