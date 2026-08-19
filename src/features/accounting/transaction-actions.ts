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
import { periodBounds } from '@/features/accounting/transaction-queries';
import {
  type ParsedTransaction,
  normalizeDate,
  normalizeIban,
  extractIban,
} from '@/features/accounting/bank-import/types';
import { extractBankStatement } from '@/lib/ai/vision';
import {
  getCategoryRuleMap,
  normalizeMatchKey,
} from '@/features/accounting/category-rules';

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Dedup hash for a statement line. `occurrence` distinguishes genuinely repeated
 * identical bookings within one statement (2 equal payments same day → kept as
 * two rows). Occurrence 0 keeps the legacy format, so re-importing does not
 * duplicate rows imported before this fix – it only adds the missing extras.
 */
function importHash(
  billingEntityId: string,
  t: ParsedTransaction,
  occurrence: number,
): string {
  const base = [
    billingEntityId,
    t.datum,
    t.betragCents,
    t.gegen ?? '',
    t.zweck ?? '',
  ];
  const parts = occurrence > 0 ? [...base, occurrence] : base;
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

const GENERIC_PAYEE = new Set([
  '',
  'n/a',
  'na',
  'unbekannt',
  'keine angabe',
  '-',
  '—',
]);

/** True when a row carries a real counterparty name (not empty / "N/A"). */
function hasPayee(t: ParsedTransaction): boolean {
  const g = (t.gegen ?? '').trim().toLowerCase();
  return g.length > 0 && !GENERIC_PAYEE.has(g);
}

/**
 * Removes "shadow" duplicates that the KI sometimes emits: the exact same
 * booking once WITH a real payee and once WITHOUT (N/A + a generic term like
 * "ONLINE-UEBERWEISUNG"). When a date+amount group contains both a named and an
 * unnamed row, the unnamed one is dropped. Genuinely unnamed bookings (no named
 * counterpart) and distinct named bookings are kept, and order is preserved.
 */
function collapseShadowDuplicates(
  txns: ParsedTransaction[],
): { kept: ParsedTransaction[]; dropped: number } {
  const namedKeys = new Set<string>();
  for (const t of txns) {
    if (hasPayee(t)) namedKeys.add(`${t.datum}|${t.betragCents}`);
  }
  const kept = txns.filter(
    (t) => hasPayee(t) || !namedKeys.has(`${t.datum}|${t.betragCents}`),
  );
  return { kept, dropped: txns.length - kept.length };
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

  const buf = Buffer.from(await file.arrayBuffer());
  const isPdf =
    file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  let transactions: ParsedTransaction[] = [];
  let accountIban: string | null = null;
  let formatLabel = 'ki';

  // KI ist die primäre Lesart – liest jede Buchung aus jedem Format zuverlässig.
  const ai = await extractBankStatement(
    isPdf ? { pdfBytes: buf } : { text: decodeStatementBytes(buf) },
  );
  if (ai) {
    accountIban = ai.account_iban || null;
    formatLabel = isPdf ? 'ki-pdf' : 'ki';
    transactions = ai.transactions.flatMap((t) => {
      const datum = t.datum ? normalizeDate(t.datum) : null;
      if (!datum || t.betrag == null || !Number.isFinite(t.betrag)) return [];
      return [
        {
          datum,
          gegen: t.gegen,
          zweck: t.zweck,
          betragCents: Math.round(t.betrag * 100),
          gegenIban: normalizeIban(t.gegen_iban) ?? extractIban(t.zweck),
        },
      ];
    });
  } else if (!isPdf) {
    // Notfall (KI nicht verfügbar): deterministische Parser für Textformate.
    const parsed = parseBankStatement(decodeStatementBytes(buf));
    transactions = parsed.transactions;
    accountIban = parsed.accountIban;
    formatLabel = parsed.format;
  }

  // KI-Härtung: doppelt gelesene Buchungen (benannt + namenloses Duplikat)
  // zusammenfassen. Bei den deterministischen Parsern nicht nötig.
  let shadowDropped = 0;
  if (ai) {
    const collapsed = collapseShadowDuplicates(transactions);
    transactions = collapsed.kept;
    shadowDropped = collapsed.dropped;
  }

  if (transactions.length === 0) {
    return errorResult(
      ai
        ? 'Keine Umsätze im Auszug erkannt.'
        : 'Konnte den Auszug nicht lesen. Ist die KI aktiviert (OPENAI_API_KEY)?',
    );
  }

  // Resolve / create the bank account by IBAN, if the statement exposes one.
  let kontoId: string | null = null;
  if (accountIban) {
    const { data: existing } = await supabase
      .from('bookkeeping_accounts')
      .select('id')
      .eq('billing_entity_id', entityId)
      .eq('iban', accountIban)
      .maybeSingle();
    if (existing) kontoId = existing.id;
    else {
      const { data: created } = await supabase
        .from('bookkeeping_accounts')
        .insert({
          organization_id: orgId,
          billing_entity_id: entityId,
          iban: accountIban,
          name: accountIban,
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

  // Learned category rules (payee → category) are applied to new rows at import.
  const ruleMap = await getCategoryRuleMap(supabase, entityId);

  const seen = new Set<string>();
  const occ = new Map<string, number>(); // base key → times seen in THIS file
  const rows = [];
  for (const t of transactions) {
    const baseKey = `${t.datum}|${t.betragCents}|${t.gegen ?? ''}|${t.zweck ?? ''}`;
    const occurrence = occ.get(baseKey) ?? 0;
    occ.set(baseKey, occurrence + 1);
    const hash = importHash(entityId, t, occurrence);
    if (knownHashes.has(hash) || seen.has(hash)) continue;
    seen.add(hash);
    const ruleHit = ruleMap.get(normalizeMatchKey(t.gegen) ?? '') ?? null;
    rows.push({
      organization_id: orgId,
      billing_entity_id: entityId,
      konto_id: kontoId,
      datum: t.datum,
      gegen: t.gegen,
      gegen_iban: t.gegenIban ?? null,
      zweck: t.zweck,
      betrag_cents: t.betragCents,
      kategorie_id: ruleHit,
      konfidenz: ruleHit ? 100 : null,
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
  const skipped = transactions.length - imported;

  await supabase.from('bookkeeping_import_log').insert({
    organization_id: orgId,
    billing_entity_id: entityId,
    kind: 'kontoauszug',
    source: `${file.name} (${formatLabel})`,
    imported_count: imported,
    skipped_count: skipped < 0 ? 0 : skipped,
    error_count: 0,
    created_by: user.id,
  });

  const shadowNote =
    shadowDropped > 0 ? ` ${shadowDropped} Doppel-Lesungen zusammengefasst.` : '';

  revalidatePath('/app/finance');
  return successResult(
    (imported > 0
      ? `${imported} Umsätze importiert (${skipped} bereits vorhanden), Format ${formatLabel}.`
      : `Keine neuen Umsätze – alle ${transactions.length} bereits vorhanden.`) +
      shadowNote,
  );
}

/** Loads a transaction's org for the authorization gate. */
async function txOrg(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  id: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('bookkeeping_transactions')
    .select('organization_id')
    .eq('id', id)
    .maybeSingle();
  return data?.organization_id ?? null;
}

/** Deletes a single bank transaction (e.g. a wrongly imported / duplicate row). */
export async function deleteTransactionAction(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const supabase = await createSupabaseServerClient();
  const orgId = await txOrg(supabase, id);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  const { error } = await supabase
    .from('bookkeeping_transactions')
    .delete()
    .eq('id', id);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath('/app/finance');
  return successResult('Umsatz gelöscht.');
}

const deleteMonthSchema = z.object({
  billingEntityId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(0).max(12),
});

/**
 * Bulk-deletes a company's transactions for a period: a concrete month
 * (1–12) or, with month 0, the whole selected year. For cleaning up a botched
 * import in one go.
 */
export async function deleteMonthTransactionsAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = deleteMonthSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { billingEntityId, year, month } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('organization_id')
    .eq('id', billingEntityId)
    .maybeSingle();
  if (!entity) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: entity.organization_id });

  const bounds = periodBounds({ year, month });
  if (!bounds) return errorResult(de.errors.VALIDATION);

  const { error, count } = await supabase
    .from('bookkeeping_transactions')
    .delete({ count: 'exact' })
    .eq('billing_entity_id', billingEntityId)
    .gte('datum', bounds.from)
    .lte('datum', bounds.to);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/finance');
  return successResult(`${count ?? 0} Umsätze gelöscht.`);
}
