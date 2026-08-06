import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logActivity } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';

/**
 * Secure download: verifies the caller can read the file row (RLS enforces
 * project access + internal visibility), then streams the bytes as an
 * attachment. Streaming (service client first, caller's client as fallback)
 * avoids any dependency on signed-URL creation.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: file } = await supabase
    .from('files')
    .select('storage_path, organization_id, file_name, mime_type, task_id')
    .eq('id', fileId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!file) {
    return NextResponse.json({ error: de.errors.NOT_FOUND }, { status: 404 });
  }

  let blob: Blob | null = null;
  try {
    const { data } = await createSupabaseServiceClient()
      .storage.from(FILES_BUCKET)
      .download(file.storage_path);
    blob = data;
  } catch (e) {
    logger.warn('files.download.service_unavailable', {
      error: (e as Error).message,
    });
  }
  if (!blob) {
    const { data } = await supabase.storage
      .from(FILES_BUCKET)
      .download(file.storage_path);
    blob = data;
  }
  if (!blob) {
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  // Record the download in the task's internal log (who downloaded which file,
  // when) when the file belongs to a task; otherwise keep a file-level entry.
  await logActivity({
    actorId: user.id,
    organizationId: file.organization_id,
    action: 'file_download',
    entityType: file.task_id ? 'task' : 'file',
    entityId: file.task_id ?? fileId,
    metadata: { fileName: file.file_name, fileId },
  });

  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': file.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.file_name)}"`,
    },
  });
}
