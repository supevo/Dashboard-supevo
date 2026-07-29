'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const addLinkSchema = z.object({
  orgId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
  category: z.enum(['guideline', 'logo', 'access']),
  title: z.string().trim().min(1, 'Bitte einen Titel angeben.').max(200),
  url: z.string().trim().url('Bitte eine gültige URL angeben.').max(2000).optional().or(z.literal('')),
  username: z.string().trim().max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

/**
 * Adds a non-file asset entry: a guideline/logo link, or an access reference
 * (service, login URL, username, link to the password manager). Intentionally
 * stores NO passwords — accesses are references only.
 */
export async function addAssetLinkAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = addLinkSchema.safeParse({
    orgId: formData.get('orgId'),
    clientCompanyId: formData.get('clientCompanyId'),
    category: formData.get('category'),
    title: formData.get('title'),
    url: formData.get('url') ?? '',
    username: formData.get('username') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    return errorResult(
      parsed.error.issues[0]?.message ?? de.errors.VALIDATION,
    );
  }
  const { orgId, clientCompanyId, category, title, url, username, notes } =
    parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'clientCompany.manage', orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('client_assets').insert({
    organization_id: orgId,
    client_company_id: clientCompanyId,
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
    organizationId: orgId,
    action: 'create',
    entityType: 'client_asset',
    entityId: clientCompanyId,
    metadata: { category },
  });

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Eintrag gespeichert.');
}

const deleteSchema = z.object({
  assetId: z.string().uuid(),
  clientCompanyId: z.string().uuid(),
});

/** Deletes an asset (and its stored object, if any). Agency-only via RLS. */
export async function deleteAssetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse({
    assetId: formData.get('assetId'),
    clientCompanyId: formData.get('clientCompanyId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Read (RLS-guarded) so we can clean up the storage object afterwards.
  const { data: asset } = await supabase
    .from('client_assets')
    .select('storage_path, organization_id')
    .eq('id', parsed.data.assetId)
    .maybeSingle();
  if (!asset) return errorResult(de.errors.FORBIDDEN);

  const { error, count } = await supabase
    .from('client_assets')
    .delete({ count: 'exact' })
    .eq('id', parsed.data.assetId);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  if (asset.storage_path) {
    try {
      await createSupabaseServiceClient()
        .storage.from(FILES_BUCKET)
        .remove([asset.storage_path]);
    } catch {
      // Best-effort; a retention job removes orphans otherwise.
    }
  }

  await logActivity({
    actorId: user.id,
    organizationId: asset.organization_id,
    action: 'delete',
    entityType: 'client_asset',
    entityId: parsed.data.assetId,
  });

  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  return successResult('Eintrag gelöscht.');
}
