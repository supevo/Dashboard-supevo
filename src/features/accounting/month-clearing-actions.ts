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
import type { ReceiptSearchHit } from '@/features/accounting/month-clearing-queries';

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
  // Noch nicht zugeordnete Belege zuerst.
  rows.sort((a, b) =>
    (a.status === 'zugeordnet' ? 1 : 0) - (b.status === 'zugeordnet' ? 1 : 0),
  );
  const hits: ReceiptSearchHit[] = rows.map((r) => ({
    id: r.id,
    fileName: r.file_name ?? '(ohne Namen)',
    haendler: r.haendler,
    bruttoCents: r.brutto_cents,
    datum: r.beleg_datum,
  }));
  return { ok: true, hits };
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
