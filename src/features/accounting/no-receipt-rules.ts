import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { normalizeMatchKey } from '@/features/accounting/category-rules';

type Supabase = SupabaseClient<Database>;

/**
 * Gelernte „kein Beleg nötig"-Regeln: normalisierter Empfängername → Grund, je
 * Firma. Wird gemerkt, sobald der Nutzer eine Buchung als „kein Beleg nötig"
 * markiert; künftige Umsätze desselben Empfängers (z. B. Finanzamt, Bankgebühr)
 * bekommen daraus einen Vorschlag. Tabelle fehlt evtl. (Migration 0195 noch
 * nicht eingespielt) → leer / no-op statt Crash.
 */
export async function getNoReceiptRuleMap(
  supabase: Supabase,
  billingEntityId: string,
): Promise<Map<string, string>> {
  try {
    const { data, error } = await supabase
      .from('bookkeeping_no_receipt_rules')
      .select('match_key, grund')
      .eq('billing_entity_id', billingEntityId);
    if (error) return new Map();
    return new Map((data ?? []).map((r) => [r.match_key, r.grund]));
  } catch {
    return new Map();
  }
}

/** Merkt (oder aktualisiert) eine Regel: dieser Empfänger → „kein Beleg" (Grund). */
export async function upsertNoReceiptRule(
  supabase: Supabase,
  params: {
    orgId: string;
    billingEntityId: string;
    gegen: string | null;
    grund: string;
    userId: string;
  },
): Promise<void> {
  const key = normalizeMatchKey(params.gegen);
  const grund = params.grund.trim();
  if (!key || grund.length < 2) return;
  try {
    await supabase.from('bookkeeping_no_receipt_rules').upsert(
      {
        organization_id: params.orgId,
        billing_entity_id: params.billingEntityId,
        match_key: key,
        grund: grund.slice(0, 500),
        created_by: params.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'billing_entity_id,match_key' },
    );
  } catch {
    /* Tabelle fehlt evtl. – Lernen ist optional. */
  }
}

/** Vergisst die Regel für einen Empfänger (wenn „Beleg doch nötig" gesetzt wird). */
export async function deleteNoReceiptRule(
  supabase: Supabase,
  billingEntityId: string,
  gegen: string | null,
): Promise<void> {
  const key = normalizeMatchKey(gegen);
  if (!key) return;
  try {
    await supabase
      .from('bookkeeping_no_receipt_rules')
      .delete()
      .eq('billing_entity_id', billingEntityId)
      .eq('match_key', key);
  } catch {
    /* no-op */
  }
}
