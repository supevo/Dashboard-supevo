'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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

/** Soft-deletes a file (metadata). RLS restricts this to the uploader or a
 *  project manager. The storage object is cleaned up by a later retention job. */
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

  // Read the OneDrive reference (if any) before soft-deleting, so we can also
  // remove the file from OneDrive (best-effort).
  const { data: fileRow } = await supabase
    .from('files')
    .select('onedrive_item_id, organization_id')
    .eq('id', parsed.data.fileId)
    .maybeSingle();

  const { error, count } = await supabase
    .from('files')
    .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', parsed.data.fileId);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  if (fileRow?.onedrive_item_id) {
    try {
      const { deleteItem } = await import('@/lib/onedrive/graph');
      await deleteItem(fileRow.organization_id, fileRow.onedrive_item_id);
    } catch {
      // best-effort; the metadata row is already gone from the UI
    }
  }

  await logActivity({
    actorId: user.id,
    organizationId: null,
    action: 'delete',
    entityType: 'file',
    entityId: parsed.data.fileId,
  });

  revalidatePath(`/app/projects/${parsed.data.projectId}/tasks/${parsed.data.taskId}`);
  return successResult('Datei gelöscht.');
}
