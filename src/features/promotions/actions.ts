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

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function orgOfPromotion(supabase: Supabase, id: string): Promise<string | null> {
  const { data } = await supabase
    .from('promotions')
    .select('organization_id')
    .eq('id', id)
    .maybeSingle();
  return data?.organization_id ?? null;
}

function intOf(v: FormDataEntryValue | null, fallback: number): number {
  if (v === null || String(v).trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}
function euroToCents(v: FormDataEntryValue | null): number {
  const n = Number(
    String(v ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''),
  );
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

const REVALIDATE = '/app/promotions';

/** Promotion anlegen oder aktualisieren. */
export async function upsertPromotionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get('id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return errorResult('Bitte einen Titel angeben.');

  const validUntilRaw = String(formData.get('validUntil') ?? '').trim();

  const discountKind = (['none', 'fixed', 'percent'] as const).includes(
    formData.get('discountKind') as 'none' | 'fixed' | 'percent',
  )
    ? (formData.get('discountKind') as 'none' | 'fixed' | 'percent')
    : 'none';
  const discountValue =
    discountKind === 'fixed'
      ? euroToCents(formData.get('discountValue'))
      : discountKind === 'percent'
        ? Math.min(100, Math.max(0, intOf(formData.get('discountValue'), 0)))
        : 0;

  const fields = {
    title,
    conditions: String(formData.get('conditions') ?? '').trim(),
    icon: String(formData.get('icon') ?? '').trim() || null,
    valid_until: validUntilRaw || null,
    discount_kind: discountKind,
    discount_value: discountValue,
    position: intOf(formData.get('position'), 0),
    active: formData.get('active') === 'on',
  };

  const supabase = await createSupabaseServerClient();
  const user = await requireUser();

  if (id) {
    const orgId = await orgOfPromotion(supabase, id);
    if (!orgId) return errorResult(de.errors.FORBIDDEN);
    authorize(user, { type: 'organization.update', orgId });
    const { error } = await supabase.from('promotions').update(fields).eq('id', id);
    if (error) return errorResult(de.errors.INTERNAL);
  } else {
    const orgId = String(formData.get('orgId') ?? '');
    if (!z.string().uuid().safeParse(orgId).success) return errorResult(de.errors.VALIDATION);
    authorize(user, { type: 'organization.update', orgId });
    const { error } = await supabase
      .from('promotions')
      .insert({ organization_id: orgId, ...fields });
    if (error) return errorResult(de.errors.INTERNAL);
  }
  revalidatePath(REVALIDATE);
  return successResult('Promotion gespeichert.');
}

export async function deletePromotionAction(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return errorResult(de.errors.VALIDATION);
  const supabase = await createSupabaseServerClient();
  const orgId = await orgOfPromotion(supabase, id);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });
  const { error } = await supabase.from('promotions').delete().eq('id', id);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath(REVALIDATE);
  return successResult('Promotion gelöscht.');
}
