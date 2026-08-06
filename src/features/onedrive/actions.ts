'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { primaryAgencyOrgId, hasAgencyAccess } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { downloadItem } from '@/lib/onedrive/graph';
import { FILES_BUCKET } from '@/lib/files/storage';
import { sanitizeFileName } from '@/lib/files/validation';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

/** Disconnects the org's OneDrive (removes the stored refresh token). Admins. */
export async function disconnectOneDriveAction(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return errorResult(de.errors.FORBIDDEN);

  await createSupabaseServiceClient()
    .from('onedrive_connections')
    .delete()
    .eq('organization_id', orgId);

  revalidatePath('/app/settings');
  return successResult('OneDrive getrennt.');
}

/** Sets the base folder the app is confined to (e.g. "ONE STEP/Kunden"). Admins. */
export async function setOneDriveRootAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const raw = String(formData.get('rootPath') ?? '').trim().slice(0, 400);
  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return errorResult(de.errors.FORBIDDEN);

  const { error } = await createSupabaseServiceClient()
    .from('onedrive_connections')
    .update({ root_path: raw || null, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/settings');
  return successResult(
    raw ? `Zugriff auf „${raw}" begrenzt.` : 'Begrenzung aufgehoben.',
  );
}

/**
 * Toggles "OneDrive as primary storage for task attachments" and sets the
 * collection folder for attachments without a client mapping. Admins.
 */
export async function setOneDrivePrimaryAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const primary = formData.get('primary') === 'on';
  const collection = String(formData.get('collectionPath') ?? '').trim().slice(0, 400);
  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return errorResult(de.errors.FORBIDDEN);

  const { error } = await createSupabaseServiceClient()
    .from('onedrive_connections')
    .update({
      primary_attachments: primary,
      collection_folder_path: collection || null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/settings');
  return successResult('Speicher-Einstellung gespeichert.');
}

const folderSchema = z.object({
  clientCompanyId: z.string().uuid(),
  folderId: z.string().min(1).max(400),
  folderPath: z.string().max(1000).optional().or(z.literal('')),
});

/** Maps a client company to a OneDrive folder (upload mirror target). Admins. */
export async function setClientFolderAction(input: {
  clientCompanyId: string;
  folderId: string;
  folderPath?: string;
}): Promise<ActionResult> {
  const parsed = folderSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return errorResult(de.errors.FORBIDDEN);

  const rls = await createSupabaseServerClient();
  const { error } = await rls.from('onedrive_folder_map').upsert(
    {
      organization_id: orgId,
      client_company_id: parsed.data.clientCompanyId,
      folder_id: parsed.data.folderId,
      folder_path: parsed.data.folderPath || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,client_company_id' },
  );
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  return successResult('OneDrive-Ordner verknüpft.');
}

/** Removes a client's OneDrive folder mapping. Admins. */
export async function clearClientFolderAction(
  clientCompanyId: string,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(clientCompanyId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return errorResult(de.errors.FORBIDDEN);

  await createSupabaseServiceClient()
    .from('onedrive_folder_map')
    .delete()
    .eq('organization_id', orgId)
    .eq('client_company_id', clientCompanyId);

  revalidatePath(`/app/clients/${clientCompanyId}`);
  return successResult('Verknüpfung entfernt.');
}

const MAX_ATTACH_BYTES = 100 * 1024 * 1024;

/**
 * Attaches a OneDrive file to a task: downloads the bytes via Graph, stores them
 * in our own file storage (so preview/download/retention work as usual) and
 * records a files-table row. Agency staff; access to the task is verified via an
 * RLS read before any privileged write.
 */
export async function attachOneDriveFileAction(input: {
  taskId: string;
  itemId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const schema = z.object({
    taskId: z.string().uuid(),
    itemId: z.string().min(1).max(400),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Ungültige Eingabe.' };

  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) return { ok: false, error: 'Keine Berechtigung.' };
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return { ok: false, error: 'Keine Organisation.' };

  // RLS gate: the caller must be able to see the task.
  const rls = await createSupabaseServerClient();
  const { data: task } = await rls
    .from('tasks')
    .select('id, project_id, organization_id')
    .eq('id', parsed.data.taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: 'Aufgabe nicht gefunden.' };

  const file = await downloadItem(orgId, parsed.data.itemId);
  if (!file) return { ok: false, error: 'Datei konnte nicht geladen werden.' };
  if (file.bytes.byteLength > MAX_ATTACH_BYTES) {
    return { ok: false, error: 'Datei ist zu groß (max. 100 MB).' };
  }

  const name = sanitizeFileName(file.name);
  const storagePath = `org/${task.organization_id}/project/${task.project_id}/onedrive/${randomUUID()}-${name}`;

  const service = createSupabaseServiceClient();
  const { error: upErr } = await service.storage
    .from(FILES_BUCKET)
    .upload(storagePath, new Uint8Array(file.bytes), {
      contentType: file.mime,
      upsert: true,
    });
  if (upErr) return { ok: false, error: 'Speichern fehlgeschlagen.' };

  const { data: row, error: insErr } = await rls
    .from('files')
    .insert({
      organization_id: task.organization_id,
      project_id: task.project_id,
      task_id: task.id,
      uploaded_by: user.id,
      storage_path: storagePath,
      file_name: name,
      mime_type: file.mime,
      size_bytes: file.bytes.byteLength,
      is_internal: true,
    })
    .select('id')
    .single();
  if (insErr || !row) {
    await service.storage.from(FILES_BUCKET).remove([storagePath]);
    return { ok: false, error: 'Anhängen fehlgeschlagen.' };
  }

  await logActivity({
    actorId: user.id,
    organizationId: task.organization_id,
    action: 'file_upload',
    entityType: 'task',
    entityId: task.id,
    metadata: { fileId: row.id, fileName: name, source: 'onedrive' },
  });

  revalidatePath(`/app/projects/${task.project_id}/tasks/${task.id}`);
  return { ok: true };
}
