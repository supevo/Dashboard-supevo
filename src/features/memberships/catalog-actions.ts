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

async function orgOfModule(supabase: Supabase, id: string): Promise<string | null> {
  const { data } = await supabase
    .from('membership_modules')
    .select('organization_id')
    .eq('id', id)
    .maybeSingle();
  return data?.organization_id ?? null;
}
async function orgOfCategory(supabase: Supabase, id: string): Promise<string | null> {
  const { data } = await supabase
    .from('membership_module_categories')
    .select('organization_id')
    .eq('id', id)
    .maybeSingle();
  return data?.organization_id ?? null;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[äöü]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' })[c] ?? c)
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'modul'
  );
}
function euroToCents(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}
function intOf(v: FormDataEntryValue | null, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

const REVALIDATE = '/app/pakete';

/** Create or update a category. */
export async function upsertCategoryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const position = intOf(formData.get('position'), 0);
  if (!name) return errorResult('Bitte einen Namen angeben.');

  const supabase = await createSupabaseServerClient();
  const user = await requireUser();

  if (id) {
    const orgId = await orgOfCategory(supabase, id);
    if (!orgId) return errorResult(de.errors.FORBIDDEN);
    authorize(user, { type: 'organization.update', orgId });
    const { error } = await supabase
      .from('membership_module_categories')
      .update({ name, position })
      .eq('id', id);
    if (error) return errorResult('Konnte nicht speichern (Name evtl. doppelt).');
  } else {
    const orgId = String(formData.get('orgId') ?? '');
    if (!z.string().uuid().safeParse(orgId).success) return errorResult(de.errors.VALIDATION);
    authorize(user, { type: 'organization.update', orgId });
    const { error } = await supabase
      .from('membership_module_categories')
      .insert({ organization_id: orgId, name, position });
    if (error) return errorResult('Konnte nicht anlegen (Name evtl. doppelt).');
  }
  revalidatePath(REVALIDATE);
  return successResult('Kategorie gespeichert.');
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return errorResult(de.errors.VALIDATION);
  const supabase = await createSupabaseServerClient();
  const orgId = await orgOfCategory(supabase, id);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });
  // Module bleiben erhalten (category_id → null durch FK on delete set null).
  const { error } = await supabase
    .from('membership_module_categories')
    .delete()
    .eq('id', id);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath(REVALIDATE);
  return successResult('Kategorie gelöscht.');
}

/** Create or update a module. */
export async function upsertModuleAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get('id') ?? '');
  const label = String(formData.get('label') ?? '').trim();
  if (!label) return errorResult('Bitte eine Bezeichnung angeben.');

  const pricingKind = (['flat', 'per_unit', 'stage'] as const).includes(
    formData.get('pricingKind') as 'flat' | 'per_unit' | 'stage',
  )
    ? (formData.get('pricingKind') as 'flat' | 'per_unit' | 'stage')
    : 'flat';

  const fields = {
    category_id: (formData.get('categoryId') as string) || null,
    label,
    description: String(formData.get('description') ?? '').trim(),
    pricing_kind: pricingKind,
    net_cents: pricingKind === 'stage' ? 0 : euroToCents(formData.get('netEuros')),
    unit_label: pricingKind === 'per_unit'
      ? String(formData.get('unitLabel') ?? '').trim() || 'Einheiten'
      : null,
    default_qty: intOf(formData.get('defaultQty'), 1),
    min_qty: intOf(formData.get('minQty'), 0),
    max_qty: intOf(formData.get('maxQty'), 99),
    stage: pricingKind === 'stage' ? (intOf(formData.get('stage'), 1) === 2 ? 2 : 1) : null,
    capture_budget: formData.get('captureBudget') === 'on',
    icon: String(formData.get('icon') ?? '').trim() || null,
    position: intOf(formData.get('position'), 0),
    active: formData.get('active') === 'on',
  };

  const supabase = await createSupabaseServerClient();
  const user = await requireUser();

  if (id) {
    const orgId = await orgOfModule(supabase, id);
    if (!orgId) return errorResult(de.errors.FORBIDDEN);
    authorize(user, { type: 'organization.update', orgId });
    const { error } = await supabase.from('membership_modules').update(fields).eq('id', id);
    if (error) return errorResult(de.errors.INTERNAL);
  } else {
    const orgId = String(formData.get('orgId') ?? '');
    if (!z.string().uuid().safeParse(orgId).success) return errorResult(de.errors.VALIDATION);
    authorize(user, { type: 'organization.update', orgId });
    const key = `${slugify(label)}_${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase
      .from('membership_modules')
      .insert({ organization_id: orgId, key, ...fields });
    if (error) return errorResult(de.errors.INTERNAL);
  }
  revalidatePath(REVALIDATE);
  return successResult('Modul gespeichert.');
}

export async function deleteModuleAction(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return errorResult(de.errors.VALIDATION);
  const supabase = await createSupabaseServerClient();
  const orgId = await orgOfModule(supabase, id);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });
  const { error } = await supabase.from('membership_modules').delete().eq('id', id);
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath(REVALIDATE);
  return successResult('Modul gelöscht.');
}
