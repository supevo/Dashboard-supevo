'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { parseEuroToCents } from '@/lib/money';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import {
  accountingProfileSchema,
  entityFolderSchema,
} from '@/features/accounting/schema';

const FINANCE_PATH = '/app/finance';

/** Parses a German-formatted percentage ("400" / "400,00") to a number. */
function parsePercent(input: string | undefined): number | null {
  if (!input || !input.trim()) return null;
  const n = Number(input.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Loads a billing entity's org id via RLS (also gates visibility). */
async function entityOrgId(billingEntityId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('billing_entities')
    .select('organization_id')
    .eq('id', billingEntityId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

/** Create or update the accounting profile (tax master data) of one company. */
export async function upsertAccountingProfileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = accountingProfileSchema.safeParse({
    billingEntityId: formData.get('billingEntityId'),
    rechtsform: formData.get('rechtsform'),
    inhaber: formData.get('inhaber') || undefined,
    ust_periode: formData.get('ust_periode'),
    hebesatz: formData.get('hebesatz') || undefined,
    weitere_einkuenfte: formData.get('weitere_einkuenfte') || undefined,
    kleinunternehmer: formData.get('kleinunternehmer') === 'on',
    kirchensteuer: formData.get('kirchensteuer') === 'on',
    splitting: formData.get('splitting') === 'on',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const d = parsed.data;

  const orgId = await entityOrgId(d.billingEntityId);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  const hebesatz = parsePercent(d.hebesatz);
  const weitere = d.weitere_einkuenfte
    ? parseEuroToCents(d.weitere_einkuenfte)
    : 0;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('accounting_profiles').upsert(
    {
      billing_entity_id: d.billingEntityId,
      organization_id: orgId,
      rechtsform: d.rechtsform,
      inhaber: d.inhaber || null,
      ust_periode: d.ust_periode,
      hebesatz,
      kleinunternehmer: d.kleinunternehmer,
      kirchensteuer: d.kirchensteuer,
      splitting: d.splitting,
      weitere_einkuenfte_cents: weitere ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'billing_entity_id' },
  );
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(FINANCE_PATH);
  return successResult('Firmenprofil gespeichert.');
}

/** Link a OneDrive folder (Einnahmen or Ausgaben) to a company. */
export async function setEntityFolderAction(input: {
  billingEntityId: string;
  kind: 'einnahmen' | 'ausgaben';
  folderId: string;
  folderPath?: string;
}): Promise<ActionResult> {
  const parsed = entityFolderSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const d = parsed.data;

  const orgId = await entityOrgId(d.billingEntityId);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  const cols =
    d.kind === 'einnahmen'
      ? {
          onedrive_einnahmen_folder_id: d.folderId,
          onedrive_einnahmen_folder_path: d.folderPath || null,
        }
      : {
          onedrive_ausgaben_folder_id: d.folderId,
          onedrive_ausgaben_folder_path: d.folderPath || null,
        };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('accounting_profiles').upsert(
    {
      billing_entity_id: d.billingEntityId,
      organization_id: orgId,
      ...cols,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'billing_entity_id' },
  );
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(FINANCE_PATH);
  return successResult(
    d.kind === 'einnahmen'
      ? 'Einnahmen-Ordner verknüpft.'
      : 'Ausgaben-Ordner verknüpft.',
  );
}

/** Remove a linked OneDrive folder from a company. */
export async function clearEntityFolderAction(input: {
  billingEntityId: string;
  kind: 'einnahmen' | 'ausgaben';
}): Promise<ActionResult> {
  const orgId = await entityOrgId(input.billingEntityId);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  const cols =
    input.kind === 'einnahmen'
      ? {
          onedrive_einnahmen_folder_id: null,
          onedrive_einnahmen_folder_path: null,
        }
      : {
          onedrive_ausgaben_folder_id: null,
          onedrive_ausgaben_folder_path: null,
        };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('accounting_profiles')
    .update({ ...cols, updated_at: new Date().toISOString() })
    .eq('billing_entity_id', input.billingEntityId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(FINANCE_PATH);
  return successResult('Verknüpfung entfernt.');
}

/** Kategorien, die aus dem Abgleich ausgeklammert werden (je Firma). */
export async function setAbgleichAusschlussAction(input: {
  billingEntityId: string;
  categoryIds: string[];
}): Promise<ActionResult> {
  if (
    typeof input?.billingEntityId !== 'string' ||
    !Array.isArray(input.categoryIds) ||
    input.categoryIds.length > 100 ||
    !input.categoryIds.every((c) => typeof c === 'string' && c.length <= 64)
  ) {
    return errorResult(de.errors.VALIDATION);
  }
  const orgId = await entityOrgId(input.billingEntityId);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();
  authorize(user, { type: 'organization.update', orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('accounting_profiles').upsert(
    {
      billing_entity_id: input.billingEntityId,
      organization_id: orgId,
      abgleich_ausschluss: input.categoryIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'billing_entity_id' },
  );
  if (error) return errorResult(de.errors.INTERNAL);
  revalidatePath(FINANCE_PATH);
  return successResult('Ausgeklammerte Kategorien gespeichert.');
}
