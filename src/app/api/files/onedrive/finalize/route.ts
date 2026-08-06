import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { validateUpload, sanitizeFileName } from '@/lib/files/validation';
import { getItemMeta } from '@/lib/onedrive/graph';
import { recordUploadError } from '@/features/onedrive/attachments';
import { logActivity } from '@/lib/audit';
import { env } from '@/lib/env';
import { de } from '@/lib/i18n/de';

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(env.NEXT_PUBLIC_APP_URL).host;
  } catch {
    return false;
  }
}

/**
 * Records a files-table row for a task attachment that the browser uploaded
 * DIRECTLY into OneDrive (no Supabase bytes). We verify the item exists in our
 * drive; the file is referenced by onedrive_item_id and storage_path stays null.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    projectId?: string;
    taskId?: string | null;
    itemId?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    isInternal?: boolean;
  } | null;

  const projectId = body?.projectId ?? '';
  const taskId = body?.taskId ?? null;
  const itemId = body?.itemId ?? '';
  const fileName = body?.fileName ?? '';
  const mimeType = body?.mimeType ?? '';
  const sizeBytes = Number(body?.sizeBytes ?? 0);
  const isInternal = body?.isInternal !== false;

  if (!projectId || !itemId || !fileName || !mimeType) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }
  if (validateUpload({ size: sizeBytes, type: mimeType })) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from('projects')
    .select('organization_id, client_company_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  // Verify the reported item really exists in our OneDrive.
  const meta = await getItemMeta(project.organization_id, itemId);
  if (!meta) {
    await recordUploadError(
      project.organization_id,
      project.client_company_id,
      fileName,
      'OneDrive-Item nach Upload nicht auffindbar.',
    );
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 400 });
  }

  const { data: fileRow, error: insertError } = await supabase
    .from('files')
    .insert({
      organization_id: project.organization_id,
      project_id: projectId,
      task_id: taskId,
      uploaded_by: user.id,
      storage_path: null,
      onedrive_item_id: itemId,
      file_name: sanitizeFileName(fileName),
      mime_type: mimeType,
      size_bytes: sizeBytes,
      is_internal: isInternal,
    })
    .select('id')
    .single();

  if (insertError || !fileRow) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  await logActivity({
    actorId: user.id,
    organizationId: project.organization_id,
    action: 'file_upload',
    entityType: taskId ? 'task' : 'project',
    entityId: taskId ?? projectId,
    metadata: { fileId: fileRow.id, source: 'onedrive', onedrive: true },
  });

  return NextResponse.json({ ok: true, fileId: fileRow.id });
}
