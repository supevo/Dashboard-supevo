'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const deleteFileSchema = z.object({
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});

/**
 * Soft-deletes a file. Authorization is checked in code (the uploader OR a
 * project manager may delete), then the write goes through the service client so
 * it works reliably regardless of RLS-update edge cases. A OneDrive-backed file
 * is also removed from OneDrive (best-effort).
 */
export async function deleteFileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteFileSchema.safeParse({
    fileId: formData.get('fileId'),
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Access gate via RLS: the caller only sees the file if they may access it.
  const { data: file } = await supabase
    .from('files')
    .select('id, project_id, uploaded_by')
    .eq('id', parsed.data.fileId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!file) return errorResult(de.errors.FORBIDDEN);

  // Authorize: uploader or a project manager.
  const isUploader = file.uploaded_by === user.id;
  let canManage = false;
  if (!isUploader) {
    const { data: cm } = await supabase.rpc('can_manage_project', {
      p_project_id: file.project_id,
    });
    canManage = cm === true;
  }
  if (!isUploader && !canManage) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();

  // OneDrive reference (tolerate the column not existing yet).
  let onedriveItemId: string | null = null;
  let orgId: string | null = null;
  const { data: ref } = await service
    .from('files')
    .select('onedrive_item_id, organization_id')
    .eq('id', parsed.data.fileId)
    .maybeSingle();
  if (ref) {
    onedriveItemId = ref.onedrive_item_id ?? null;
    orgId = ref.organization_id ?? null;
  }

  const { error } = await service
    .from('files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', parsed.data.fileId);
  if (error) return errorResult(de.errors.INTERNAL);

  if (onedriveItemId && orgId) {
    try {
      const { deleteItem } = await import('@/lib/onedrive/graph');
      await deleteItem(orgId, onedriveItemId);
    } catch {
      // best-effort
    }
  }

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'delete',
    entityType: 'file',
    entityId: parsed.data.fileId,
  });

  revalidatePath(`/app/projects/${parsed.data.projectId}/tasks/${parsed.data.taskId}`);
  revalidatePath(`/portal/projects/${parsed.data.projectId}/tasks/${parsed.data.taskId}`);
  return successResult('Datei gelöscht.');
}
