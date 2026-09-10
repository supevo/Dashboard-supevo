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
import { importOneDriveReceiptsAction } from '@/features/accounting/receipt-actions';
import { listFolderFilesRecursive } from '@/lib/onedrive/graph';
import { folderMonthDate } from '@/features/accounting/folder-month';
import { resolveReceiptMime } from '@/lib/ai/vision';
import type {
  ReceiptSearchHit,
  OneDriveFileHit,
} from '@/features/accounting/month-clearing-queries';

const assignSchema = z.object({
  txId: z.string().uuid(),
  receiptId: z.string().uuid(),
});

/**
 * Ordnet einen Beleg von Hand einer Bankbuchung zu (der „Notstep", wenn die
 * Automatik nichts Passendes findet). Setzt tx.beleg_id und markiert den Beleg
 * als zugeordnet – identisch zum Abgleich.
 */
export async function assignReceiptAction(input: {
  txId: string;
  receiptId: string;
}): Promise<ActionResult> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const supabase = await createSupabaseServerClient();
  const { data: tx } = await supabase
    .from('bookkeeping_transactions')
    .select('organization_id')
    .eq('id', parsed.data.txId)
    .maybeSingle();
  if (!tx) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: tx.organization_id });

  const { error: e1 } = await supabase
    .from('bookkeeping_transactions')
    .update({ beleg_id: parsed.data.receiptId, beleg_nicht_noetig: false } as never)
    .eq('id', parsed.data.txId);
  const { error: e2 } = await supabase
    .from('bookkeeping_receipts')
    .update({ status: 'zugeordnet' } as never)
    .eq('id', parsed.data.receiptId);
  if (e1 || e2) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/finance');
  return successResult('Beleg zugeordnet.');
}

/**
 * Hebt eine falsche Beleg-Zuordnung an einer Bankbuchung wieder auf: tx.beleg_id
 * wird geleert; hängt kein anderer Umsatz mehr am Beleg, geht dieser zurück auf
 * „offen". Danach lässt sich der richtige Beleg zuordnen.
 */
export async function unassignReceiptAction(input: {
  txId: string;
}): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(input.txId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const { data: tx } = await supabase
    .from('bookkeeping_transactions')
    .select('organization_id, beleg_id')
    .eq('id', input.txId)
    .maybeSingle();
  if (!tx) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: tx.organization_id });

  const receiptId = (tx as { beleg_id: string | null }).beleg_id;
  const { error } = await supabase
    .from('bookkeeping_transactions')
    .update({ beleg_id: null } as never)
    .eq('id', input.txId);
  if (error) return errorResult(de.errors.INTERNAL);

  // Beleg zurück auf „offen", wenn ihn kein anderer Umsatz mehr belegt.
  if (receiptId) {
    const { count } = await supabase
      .from('bookkeeping_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('beleg_id', receiptId);
    if (!count || count === 0) {
      await supabase
        .from('bookkeeping_receipts')
        .update({ status: 'offen' } as never)
        .eq('id', receiptId);
    }
  }

  revalidatePath('/app/finance');
  return successResult('Zuordnung aufgehoben.');
}

const searchSchema = z.object({
  billingEntityId: z.string().uuid(),
  query: z.string().trim().max(120),
});

/**
 * Datei-Suche über das Belegarchiv (für die händische Zuordnung). Sucht nach
 * Dateiname oder Händler; noch nicht zugeordnete Belege zuerst.
 */
export async function searchReceiptsAction(input: {
  billingEntityId: string;
  query: string;
}): Promise<{ ok: boolean; hits?: ReceiptSearchHit[]; error?: string }> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: de.errors.VALIDATION };

  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from('bookkeeping_receipts')
    .select('id, file_name, haendler, brutto_cents, beleg_datum, status')
    .eq('billing_entity_id', parsed.data.billingEntityId)
    .order('beleg_datum', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(30);
  const term = parsed.data.query;
  if (term.length >= 1) {
    const safe = term.replace(/[%,]/g, ' ');
    q = q.or(`file_name.ilike.%${safe}%,haendler.ilike.%${safe}%`);
  }
  const { data, error } = await q;
  if (error) return { ok: false, error: de.errors.INTERNAL };

  const rows = (data ?? []) as unknown as {
    id: string;
    file_name: string | null;
    haendler: string | null;
    brutto_cents: number | null;
    beleg_datum: string | null;
    status: string | null;
  }[];
  // Reihenfolge: neueste zuerst (Belegdatum, dann Import) – kommt so aus der DB.
  const hits: ReceiptSearchHit[] = rows.map((r) => ({
    id: r.id,
    fileName: r.file_name ?? '(ohne Namen)',
    haendler: r.haendler,
    bruttoCents: r.brutto_cents,
    datum: r.beleg_datum,
  }));
  return { ok: true, hits };
}

async function entityFolders(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  billingEntityId: string,
): Promise<{
  orgId: string | null;
  folders: { kind: 'einnahmen' | 'ausgaben'; id: string; path: string }[];
}> {
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('organization_id')
    .eq('id', billingEntityId)
    .maybeSingle();
  const { data: profile } = await supabase
    .from('accounting_profiles')
    .select(
      'onedrive_einnahmen_folder_id, onedrive_einnahmen_folder_path, onedrive_ausgaben_folder_id, onedrive_ausgaben_folder_path',
    )
    .eq('billing_entity_id', billingEntityId)
    .maybeSingle();
  const p = (profile ?? {}) as Record<string, string | null>;
  const folders: { kind: 'einnahmen' | 'ausgaben'; id: string; path: string }[] =
    [];
  if (p.onedrive_ausgaben_folder_id)
    folders.push({
      kind: 'ausgaben',
      id: p.onedrive_ausgaben_folder_id,
      path: p.onedrive_ausgaben_folder_path ?? '',
    });
  if (p.onedrive_einnahmen_folder_id)
    folders.push({
      kind: 'einnahmen',
      id: p.onedrive_einnahmen_folder_id,
      path: p.onedrive_einnahmen_folder_path ?? '',
    });
  return { orgId: entity?.organization_id ?? null, folders };
}

/**
 * Der „Notstep", wenn die Beleg-Suche über die bereits importierten Belege nichts
 * findet: direkt die OneDrive-Ordner nach Dateinamen durchsuchen. So lässt sich
 * auch eine Datei auswählen, die noch nicht als Beleg importiert wurde.
 */
export async function searchOneDriveFilesAction(input: {
  billingEntityId: string;
  query: string;
}): Promise<{ ok: boolean; hits?: OneDriveFileHit[]; error?: string }> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: de.errors.VALIDATION };

  const supabase = await createSupabaseServerClient();
  const { orgId, folders } = await entityFolders(
    supabase,
    parsed.data.billingEntityId,
  );
  if (!orgId) return { ok: false, error: de.errors.FORBIDDEN };
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });
  if (folders.length === 0)
    return { ok: false, error: 'Keine OneDrive-Ordner verknüpft (Tab „Firmen").' };

  const term = parsed.data.query.trim().toLowerCase();
  const hits: OneDriveFileHit[] = [];
  const seen = new Set<string>();
  for (const folder of folders) {
    const files = await listFolderFilesRecursive(orgId, folder.id, {
      rootPath: folder.path,
      maxFiles: 3000,
    });
    if (!files) continue;
    for (const f of files) {
      if (seen.has(f.id)) continue;
      const name = f.name ?? '';
      if (term && !name.toLowerCase().includes(term)) continue;
      seen.add(f.id);
      hits.push({
        itemId: f.id,
        fileName: name,
        folder: f.parentPath ?? '',
        kind: folder.kind,
      });
      if (hits.length >= 40) break;
    }
    if (hits.length >= 40) break;
  }
  // Neueste Ordner zuerst (Pfad enthält „2026/08. …") – grob nach Pfad absteigend.
  hits.sort((a, b) => (a.folder < b.folder ? 1 : a.folder > b.folder ? -1 : 0));
  return { ok: true, hits };
}

const assignOdSchema = z.object({
  txId: z.string().uuid(),
  billingEntityId: z.string().uuid(),
  itemId: z.string().min(1).max(300),
  fileName: z.string().min(1).max(400),
  kind: z.enum(['einnahmen', 'ausgaben']),
  folder: z.string().max(400).optional(),
});

/**
 * Ordnet eine konkrete OneDrive-Datei einem Umsatz zu: legt den Beleg an, falls
 * er noch nicht importiert wurde (dedup über onedrive_item_id), und verknüpft ihn
 * mit der Buchung. Danach kann die Datei bei Bedarf per KI ausgelesen werden.
 */
export async function assignOneDriveFileAction(input: {
  txId: string;
  billingEntityId: string;
  itemId: string;
  fileName: string;
  kind: 'einnahmen' | 'ausgaben';
  folder?: string;
}): Promise<ActionResult> {
  const parsed = assignOdSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { txId, billingEntityId, itemId, fileName, kind, folder } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: tx } = await supabase
    .from('bookkeeping_transactions')
    .select('organization_id')
    .eq('id', txId)
    .maybeSingle();
  if (!tx) return errorResult(de.errors.FORBIDDEN);
  const orgId = tx.organization_id;
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  // Beleg finden oder neu anlegen (dedup über die OneDrive-Item-ID).
  const { data: existing } = await supabase
    .from('bookkeeping_receipts')
    .select('id')
    .eq('billing_entity_id', billingEntityId)
    .eq('onedrive_item_id', itemId)
    .maybeSingle();

  let receiptId = existing?.id ?? null;
  if (!receiptId) {
    const { data: created, error } = await supabase
      .from('bookkeeping_receipts')
      .insert(
        {
          organization_id: orgId,
          billing_entity_id: billingEntityId,
          kind: kind === 'einnahmen' ? 'einnahme' : 'ausgabe',
          source: 'onedrive',
          onedrive_item_id: itemId,
          file_name: fileName,
          file_mime: resolveReceiptMime(fileName, null),
          beleg_datum: folder ? folderMonthDate(folder) : null,
          created_by: user.id,
        } as never,
      )
      .select('id')
      .maybeSingle();
    if (error || !created) return errorResult(de.errors.INTERNAL);
    receiptId = (created as { id: string }).id;
  }

  const { error: e1 } = await supabase
    .from('bookkeeping_transactions')
    .update({ beleg_id: receiptId, beleg_nicht_noetig: false } as never)
    .eq('id', txId);
  const { error: e2 } = await supabase
    .from('bookkeeping_receipts')
    .update({ status: 'zugeordnet' } as never)
    .eq('id', receiptId);
  if (e1 || e2) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/finance');
  return successResult('OneDrive-Datei als Beleg zugeordnet.');
}

/**
 * „Belege neu prüfen": scannt die OneDrive-Ordner erneut, damit nachträglich
 * abgelegte Belege reinkommen. Ein-/Ausgaben in einem Rutsch. Danach kann die
 * Zuordnung neu greifen.
 */
export async function rescanBelegeAction(input: {
  billingEntityId: string;
}): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(input.billingEntityId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const ein = await importOneDriveReceiptsAction({
    billingEntityId: input.billingEntityId,
    kind: 'einnahmen',
  });
  const aus = await importOneDriveReceiptsAction({
    billingEntityId: input.billingEntityId,
    kind: 'ausgaben',
  });
  revalidatePath('/app/finance');
  if (ein.status === 'error' && aus.status === 'error') {
    return errorResult('OneDrive nicht erreichbar oder keine Ordner verknüpft.');
  }
  return successResult('Belege neu geprüft – ggf. neue Belege importiert.');
}
