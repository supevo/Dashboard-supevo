import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { validateUpload, sanitizeFileName } from '@/lib/files/validation';
import { FILES_BUCKET } from '@/lib/files/storage';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { env } from '@/lib/env';
import { logActivity } from '@/lib/audit';
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
 * Step 3 of the direct-to-storage upload: records the files-table row after the
 * browser uploaded the bytes to `storagePath`. Security: the storage path is
 * re-derived from the project's organization (server-trusted) and the client's
 * value must match that prefix, so a caller cannot register an object outside
 * their tenant. The files-table INSERT is still RLS-guarded.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: de.errors.UNAUTHENTICATED },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    projectId?: string;
    taskId?: string | null;
    storagePath?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    checksum?: string | null;
    isInternal?: boolean;
  } | null;

  const projectId = body?.projectId ?? '';
  const taskId = body?.taskId ?? null;
  const storagePath = body?.storagePath ?? '';
  const fileName = body?.fileName ?? '';
  const mimeType = body?.mimeType ?? '';
  const sizeBytes = Number(body?.sizeBytes ?? 0);
  const checksum = body?.checksum ?? null;
  const isInternal = body?.isInternal !== false;

  if (!projectId || !storagePath || !fileName || !mimeType) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }

  if (validateUpload({ size: sizeBytes, type: mimeType })) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  // The storage path must live under this project's tenant folder. This blocks
  // a client from registering an object outside their organization/project.
  const expectedPrefix = `org/${project.organization_id}/project/${projectId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const { data: fileRow, error: insertError } = await supabase
    .from('files')
    .insert({
      organization_id: project.organization_id,
      project_id: projectId,
      task_id: taskId,
      uploaded_by: user.id,
      storage_path: storagePath,
      file_name: sanitizeFileName(fileName),
      mime_type: mimeType,
      size_bytes: sizeBytes,
      checksum_sha256: checksum,
      is_internal: isInternal,
    })
    .select('id')
    .single();

  if (insertError || !fileRow) {
    // Roll back the uploaded object if the metadata insert was rejected.
    try {
      createSupabaseServiceClient()
        .storage.from(FILES_BUCKET)
        .remove([storagePath]);
    } catch {
      // Best-effort cleanup; a retention job removes orphans otherwise.
    }
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  await logActivity({
    actorId: user.id,
    organizationId: project.organization_id,
    action: 'file_upload',
    entityType: taskId ? 'task' : 'project',
    entityId: taskId ?? projectId,
    metadata: { fileId: fileRow.id, mime: mimeType, size: sizeBytes },
  });

  return NextResponse.json({ ok: true, fileId: fileRow.id });
}
