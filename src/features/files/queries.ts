import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface FileView {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isInternal: boolean;
  uploadedBy: string;
  createdAt: string;
  canDelete: boolean;
}

export { isPreviewable } from '@/features/files/preview';

/** Lists files for a task. RLS hides internal files from clients. */
export async function listTaskFiles(
  taskId: string,
  currentUserId: string,
): Promise<FileView[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('files')
    .select('id, file_name, mime_type, size_bytes, is_internal, uploaded_by, created_at, project_id')
    .eq('task_id', taskId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  const rows = data ?? [];

  // Managers may delete any file in the project (not just their own uploads),
  // so the delete button also shows on files uploaded by others.
  let canManage = false;
  const projectId = rows[0]?.project_id;
  if (projectId) {
    const { data: cm } = await supabase.rpc('can_manage_project', {
      p_project_id: projectId,
    });
    canManage = cm === true;
  }

  return rows.map((f) => ({
    id: f.id,
    fileName: f.file_name,
    mimeType: f.mime_type,
    sizeBytes: f.size_bytes,
    isInternal: f.is_internal,
    uploadedBy: f.uploaded_by,
    createdAt: f.created_at,
    canDelete: f.uploaded_by === currentUserId || canManage,
  }));
}
