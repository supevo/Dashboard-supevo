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
    .select('organization_id')
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

  revalidatePath('/app/finance');
  return successResult('Kategorie gespeichert.');
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

  const { data: rows } = await supabase
    .from('bookkeeping_transactions')
    .select('id, gegen, zweck, betrag_cents')
    .eq('billing_entity_id', billingEntityId)
    .is('kategorie_id', null)
    .limit(2000);

  let updated = 0;
  for (const t of rows ?? []) {
    const guess = categorizeTransaction({
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
