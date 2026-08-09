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
import { KATEGORIEN } from '@/features/accounting/categories';
import { categorizeTransaction } from '@/features/accounting/categorize';
import {
  getCategoryRuleMap,
  upsertCategoryRule,
  deleteCategoryRule,
  normalizeMatchKey,
} from '@/features/accounting/category-rules';

const VALID_IDS = new Set(KATEGORIEN.map((k) => k.id));

/** Sets (or clears) the category of one transaction. */
export async function setTransactionCategoryAction(input: {
  transactionId: string;
  kategorieId: string | null;
}): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(input.transactionId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const kategorieId = input.kategorieId || null;
  if (kategorieId && !VALID_IDS.has(kategorieId)) {
    return errorResult(de.errors.VALIDATION);
  }

  const supabase = await createSupabaseServerClient();
  const { data: tx } = await supabase
    .from('bookkeeping_transactions')
    .select('organization_id, billing_entity_id, gegen')
    .eq('id', input.transactionId)
    .maybeSingle();
  if (!tx) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: tx.organization_id });

  const { error } = await supabase
    .from('bookkeeping_transactions')
    .update({
      kategorie_id: kategorieId,
      // A manual pick is certain; clearing resets confidence.
      konfidenz: kategorieId ? 100 : null,
    })
    .eq('id', input.transactionId);
  if (error) return errorResult(de.errors.INTERNAL);

  // Learn from the manual pick: remember payee → category (or forget on clear),
  // so future transactions of the same counterparty categorize themselves.
  if (kategorieId) {
    await upsertCategoryRule(supabase, {
      orgId: tx.organization_id,
      billingEntityId: tx.billing_entity_id,
      gegen: tx.gegen,
      kategorieId,
      userId: user.id,
    });
  } else {
    await deleteCategoryRule(supabase, tx.billing_entity_id, tx.gegen);
  }

  revalidatePath('/app/finance');
  return successResult(
    kategorieId
      ? 'Kategorie gespeichert – gilt künftig automatisch für diesen Empfänger.'
      : 'Kategorie entfernt.',
  );
}

/**
 * Auto-categorizes every not-yet-categorized transaction of a company with the
 * rule-based engine. Only fills gaps – manually set categories are untouched.
 */
export async function autoCategorizeAction(
  billingEntityId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(billingEntityId).success) {
    return errorResult(de.errors.VALIDATION);
  }

  const supabase = await createSupabaseServerClient();
  const { data: entity } = await supabase
    .from('billing_entities')
    .select('organization_id')
    .eq('id', billingEntityId)
    .maybeSingle();
  if (!entity) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId: entity.organization_id });

  const [{ data: rows }, ruleMap] = await Promise.all([
    supabase
      .from('bookkeeping_transactions')
      .select('id, gegen, zweck, betrag_cents')
      .eq('billing_entity_id', billingEntityId)
      .is('kategorie_id', null)
      .limit(2000),
    getCategoryRuleMap(supabase, billingEntityId),
  ]);

  let updated = 0;
  for (const t of rows ?? []) {
    // Learned rule (same payee → chosen category) wins over the keyword engine.
    const ruleHit = ruleMap.get(normalizeMatchKey(t.gegen) ?? '');
    const kategorieId = ruleHit ?? null;
    const guess = kategorieId
      ? { kategorieId, konfidenz: 1 }
      : categorizeTransaction({
          gegen: t.gegen,
          zweck: t.zweck,
          betragCents: t.betrag_cents,
        });
    if (!guess) continue;
    const { error } = await supabase
      .from('bookkeeping_transactions')
      .update({
        kategorie_id: guess.kategorieId,
        konfidenz: Math.round(guess.konfidenz * 100),
      })
      .eq('id', t.id);
    if (!error) updated += 1;
  }

  revalidatePath('/app/finance');
  return successResult(
    updated > 0
      ? `${updated} Umsätze automatisch kategorisiert. Bitte unsichere prüfen.`
      : 'Keine offenen Umsätze zum Kategorisieren.',
  );
}
