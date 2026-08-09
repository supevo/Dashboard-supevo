'use server';

import { createHash } from 'node:crypto';
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
import {
  parseBankStatement,
  decodeStatementBytes,
} from '@/features/accounting/bank-import/parse';
import type { ParsedTransaction } from '@/features/accounting/bank-import/types';

const MAX_BYTES = 15 * 1024 * 1024;

function importHash(
  billingEntityId: string,
  t: ParsedTransaction,
): string {
  return createHash('sha256')
    .update(
      [billingEntityId, t.datum, t.betragCents, t.gegen ?? '', t.zweck ?? ''].join(
        '|',
      ),
    )
    .digest('hex');
}

/**
 * Imports a bank statement file (CSV / CAMT.053 / MT940). Auto-detects the
 * format, decodes Windows-1252 when needed, dedups against already-imported
 * transactions via a content hash (overlapping statements are skipped) and
 * attaches an account by IBAN when the format exposes one.
 */
export async function importBankStatementAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const billingEntityId = formData.get('billingEntityId');
  if (!z.string().uuid().safeParse(billingEntityId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const entityId = billingEntityId as string;

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return errorResult('Bitte eine Kontoauszug-Datei auswählen.');
  }
  if (file.size > MAX_BYTES) {
    return errorResult('Datei ist zu groß (max. 15 MB).');
  }

  const supabase = await createSupabaseServerClient();
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('organization_id')
    .eq('id', entityId)
    .maybeSingle();
  if (!entity) return errorResult(de.errors.FORBIDDEN);
  const orgId = entity.organization_id;

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = decodeStatementBytes(bytes);
  const parsed = parseBankStatement(text);

  if (parsed.format === 'unknown') {
    return errorResult(
      'Format nicht erkannt. Unterstützt: CSV (dt. Banken), CAMT.053 (XML), MT940. PDF folgt.',
    );
  }
  if (parsed.transactions.length === 0) {
    return errorResult(
      `Keine Umsätze in der Datei gefunden (erkanntes Format: ${parsed.format}).`,
    );
  }

  // Resolve / create the bank account by IBAN, if the statement exposes one.
  let kontoId: string | null = null;
  if (parsed.accountIban) {
    const { data: existing } = await supabase
      .from('bookkeeping_accounts')
      .select('id')
      .eq('billing_entity_id', entityId)
      .eq('iban', parsed.accountIban)
      .maybeSingle();
    if (existing) kontoId = existing.id;
    else {
      const { data: created } = await supabase
        .from('bookkeeping_accounts')
        .insert({
          organization_id: orgId,
          billing_entity_id: entityId,
          iban: parsed.accountIban,
          name: parsed.accountIban,
          typ: 'giro',
        })
        .select('id')
        .maybeSingle();
      kontoId = created?.id ?? null;
    }
  }

  // Dedup against known hashes for this company.
  const { data: known } = await supabase
    .from('bookkeeping_transactions')
    .select('import_hash')
    .eq('billing_entity_id', entityId)
    .not('import_hash', 'is', null);
  const knownHashes = new Set((known ?? []).map((r) => r.import_hash));

  const seen = new Set<string>();
  const rows = [];
  for (const t of parsed.transactions) {
    const hash = importHash(entityId, t);
    if (knownHashes.has(hash) || seen.has(hash)) continue;
    seen.add(hash);
    rows.push({
      organization_id: orgId,
      billing_entity_id: entityId,
      konto_id: kontoId,
      datum: t.datum,
      gegen: t.gegen,
      zweck: t.zweck,
      betrag_cents: t.betragCents,
      import_hash: hash,
      created_by: user.id,
    });
  }

  let imported = 0;
  if (rows.length > 0) {
    const { error, count } = await supabase
      .from('bookkeeping_transactions')
      .insert(rows, { count: 'exact' });
    if (error) return errorResult(de.errors.INTERNAL);
    imported = count ?? rows.length;
  }
  const skipped = parsed.transactions.length - imported;

  await supabase.from('bookkeeping_import_log').insert({
    organization_id: orgId,
    billing_entity_id: entityId,
    kind: 'kontoauszug',
    source: `${file.name} (${parsed.format})`,
    imported_count: imported,
    skipped_count: skipped < 0 ? 0 : skipped,
    error_count: 0,
    created_by: user.id,
  });

  revalidatePath('/app/finance');
  return successResult(
    imported > 0
      ? `${imported} Umsätze importiert (${skipped} bereits vorhanden), Format ${parsed.format}.`
      : `Keine neuen Umsätze – alle ${parsed.transactions.length} bereits vorhanden.`,
  );
}
