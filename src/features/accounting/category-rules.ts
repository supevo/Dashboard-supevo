import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Supabase = SupabaseClient<Database>;

const LEGAL_FORMS =
  /\b(gmbh|ug|ag|kg|ohg|gbr|mbh|co|kgaa|ltd|inc|llc|e\.?k\.?|e\.?v\.?|s\.?a\.?r\.?l\.?)\b/gi;

/**
 * Normalizes a counterparty name to a stable match key: lowercased, legal forms
 * and punctuation stripped, whitespace collapsed. Returns null when too short to
 * be a reliable key. Same payee → same key → same learned category.
 */
export function normalizeMatchKey(gegen: string | null | undefined): string | null {
  if (!gegen) return null;
  const s = gegen
    .toLowerCase()
    .replace(LEGAL_FORMS, ' ')
    .replace(/[^a-z0-9äöüß ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length >= 3 ? s : null;
}

/** Loads a company's learned rules as match_key → kategorie_id. */
export async function getCategoryRuleMap(
  supabase: Supabase,
  billingEntityId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('bookkeeping_category_rules')
    .select('match_key, kategorie_id')
    .eq('billing_entity_id', billingEntityId);
  return new Map((data ?? []).map((r) => [r.match_key, r.kategorie_id]));
}

/** Remembers (or updates) a rule: this payee → this category. */
export async function upsertCategoryRule(
  supabase: Supabase,
  params: {
    orgId: string;
    billingEntityId: string;
    gegen: string | null;
    kategorieId: string;
    userId: string;
  },
): Promise<void> {
  const key = normalizeMatchKey(params.gegen);
  if (!key) return;
  await supabase.from('bookkeeping_category_rules').upsert(
    {
      organization_id: params.orgId,
      billing_entity_id: params.billingEntityId,
      match_key: key,
      kategorie_id: params.kategorieId,
      created_by: params.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'billing_entity_id,match_key' },
  );
}

/** Forgets the rule for a payee (used when a category is cleared). */
export async function deleteCategoryRule(
  supabase: Supabase,
  billingEntityId: string,
  gegen: string | null,
): Promise<void> {
  const key = normalizeMatchKey(gegen);
  if (!key) return;
  await supabase
    .from('bookkeeping_category_rules')
    .delete()
    .eq('billing_entity_id', billingEntityId)
    .eq('match_key', key);
}
