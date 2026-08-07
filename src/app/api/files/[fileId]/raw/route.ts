import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { FILES_BUCKET, readOneDriveItemId } from '@/lib/files/storage';
import { getDownloadUrl } from '@/lib/onedrive/graph';
import { logger } from '@/lib/logger';

/**
 * Streams a file's bytes for inline viewing (image/PDF/video preview). The
 * files-table SELECT (RLS) is the authorization gate. Bytes are streamed
 * through this route — service client first, caller's client as fallback — so
 * previewing never depends on a signed URL round-trip.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: file } = await supabase
    .from('files')
    .select('storage_path, organization_id, mime_type, file_name')
    .eq('id', fileId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!file) return new NextResponse(null, { status: 404 });

  const onedriveItemId = await readOneDriveItemId(supabase, fileId);

  // OneDrive-backed file: redirect to the pre-authenticated URL for inline view.
  if (onedriveItemId) {
    const dl = await getDownloadUrl(file.organization_id, onedriveItemId);
    if (!dl) return new NextResponse(null, { status: 502 });
    return NextResponse.redirect(dl.url);
  }
  if (!file.storage_path) return new NextResponse(null, { status: 404 });

  let blob: Blob | null = null;
  try {
    const { data } = await createSupabaseServiceClient()
      .storage.from(FILES_BUCKET)
      .download(file.storage_path);
    blob = data;
  } catch (e) {
    logger.warn('files.raw.service_unavailable', { error: (e as Error).message });
  }
  if (!blob) {
    const { data } = await supabase.storage
      .from(FILES_BUCKET)
      .download(file.storage_path);
    blob = data;
  }
  if (!blob) return new NextResponse(null, { status: 500 });

  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': file.mime_type || blob.type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.file_name)}"`,
      'Cache-Control': 'private, max-age=120',
    },
  });
}
