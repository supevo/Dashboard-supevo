'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { resolveAssetAccess } from './access';

/** Refreshes both the agency client page and the client portal hub. */
function revalidateHub(clientCompanyId: string): void {
  revalidatePath(`/app/clients/${clientCompanyId}`);
  revalidatePath('/portal/hub');
}

const createBrandSchema = z.object({
  clientCompanyId: z.string().uuid(),
  name: z.string().trim().min(1, 'Bitte einen Markennamen angeben.').max(120),
});

/** Creates a (sub-)brand in the Marken-Hub. Agency staff or a client contact. */
export async function createBrandAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createBrandSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    name: formData.get('name'),
  });
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const { clientCompanyId, name } = parsed.data;

  const access = await resolveAssetAccess(clientCompanyId);
  if (!access) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();

  const service = createSupabaseServiceClient();
  const { error } = await service.from('client_brands').insert({
    organization_id: access.orgId,
    client_company_id: clientCompanyId,
    name,
    created_by: user.id,
  });
  if (error) return errorResult(de.errors.INTERNAL);

  revalidateHub(clientCompanyId);
  return successResult('Marke angelegt.');
}

const deleteBrandSchema = z.object({
  clientCompanyId: z.string().uuid(),
  brandId: z.string().uuid(),
});

/** Deletes a brand; its assets fall back to „Allgemein" (FK on delete set null). */
export async function deleteBrandAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteBrandSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    brandId: formData.get('brandId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, brandId } = parsed.data;

  const access = await resolveAssetAccess(clientCompanyId);
  if (!access) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('client_brands')
    .delete()
    .eq('id', brandId)
    .eq('client_company_id', clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidateHub(clientCompanyId);
  return successResult('Marke gelöscht.');
}

const addLinkSchema = z.object({
  clientCompanyId: z.string().uuid(),
  brandId: z.string().uuid().optional().or(z.literal('')),
  category: z.enum(['guideline', 'logo', 'access']),
  title: z.string().trim().min(1, 'Bitte einen Titel angeben.').max(200),
  url: z.string().trim().url('Bitte eine gültige URL angeben.').max(2000).optional().or(z.literal('')),
  username: z.string().trim().max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

/**
 * Adds a non-file asset entry: a guideline/logo link, or an access reference
 * (service, login URL, username, link to the password manager). Intentionally
 * stores NO passwords — accesses are references only, and access entries are
 * agency-only. Agency staff or a client contact may add guideline/logo links.
 */
export async function addAssetLinkAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = addLinkSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    brandId: formData.get('brandId') ?? '',
    category: formData.get('category'),
    title: formData.get('title'),
    url: formData.get('url') ?? '',
    username: formData.get('username') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const { clientCompanyId, brandId, category, title, url, username, notes } =
    parsed.data;

  const access = await resolveAssetAccess(clientCompanyId);
  if (!access) return errorResult(de.errors.FORBIDDEN);
  // Access references (credentials) are team-internal — clients cannot add them.
  if (category === 'access' && !access.isAgency) {
    return errorResult(de.errors.FORBIDDEN);
  }
  const user = await requireUser();

  const service = createSupabaseServiceClient();
  const { error } = await service.from('client_assets').insert({
    organization_id: access.orgId,
    client_company_id: clientCompanyId,
    brand_id: brandId || null,
    category,
    title,
    url: url || null,
    username: username || null,
    notes: notes || null,
    created_by: user.id,
  });
  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: access.orgId,
    action: 'create',
    entityType: 'client_asset',
    entityId: clientCompanyId,
    metadata: { category },
  });

  revalidateHub(clientCompanyId);
  return successResult('Eintrag gespeichert.');
}

const deleteSchema = z.object({
  assetId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
});

/** Deletes an asset (and its stored object, if any). Agency or client contact. */
export async function deleteAssetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse({
    assetId: formData.get('assetId'),
    clientCompanyId: formData.get('clientCompanyId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { assetId, clientCompanyId } = parsed.data;

  const access = await resolveAssetAccess(clientCompanyId);
  if (!access) return errorResult(de.errors.FORBIDDEN);
  const user = await requireUser();

  const service = createSupabaseServiceClient();
  // The asset must belong to this (authorized) company.
  const { data: asset } = await service
    .from('client_assets')
    .select('storage_path, category')
    .eq('id', assetId)
    .eq('client_company_id', clientCompanyId)
    .maybeSingle();
  if (!asset) return errorResult(de.errors.NOT_FOUND);
  // A client may not delete team-internal access references.
  if (asset.category === 'access' && !access.isAgency) {
    return errorResult(de.errors.FORBIDDEN);
  }

  const { error } = await service
    .from('client_assets')
    .delete()
    .eq('id', assetId)
    .eq('client_company_id', clientCompanyId);
  if (error) return errorResult(de.errors.INTERNAL);

  if (asset.storage_path) {
    try {
      await service.storage.from(FILES_BUCKET).remove([asset.storage_path]);
    } catch {
      // Best-effort; a retention job removes orphans otherwise.
    }
  }

  await logActivity({
    actorId: user.id,
    organizationId: access.orgId,
    action: 'delete',
    entityType: 'client_asset',
    entityId: assetId,
  });

  revalidateHub(clientCompanyId);
  return successResult('Eintrag gelöscht.');
}
