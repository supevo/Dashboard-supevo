import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { createSignedFileUrl, readOneDriveItemId } from '@/lib/files/storage';
import { getDownloadUrl } from '@/lib/onedrive/graph';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';

/**
 * Returns a short-lived signed URL as JSON for a file the caller may read.
 * `?disposition=inline` yields a URL the browser renders in place (used by the
 * preview popup); anything else yields an attachment-download URL.
 *
 * Access control: the files-table SELECT (RLS) below is the authorization gate.
 * A user who may not see the file (foreign/internal) gets no row → 404.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: de.errors.UNAUTHENTICATED },
      { status: 401 },
    );
  }

  const disposition =
    request.nextUrl.searchParams.get('disposition') === 'inline'
      ? 'inline'
      : 'attachment';

  const supabase = await createSupabaseServerClient();
  const { data: file } = await supabase
    .from('files')
    .select('storage_path, mime_type, file_name, organization_id')
    .eq('id', fileId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!file) {
    return NextResponse.json({ error: de.errors.NOT_FOUND }, { status: 404 });
  }

  const onedriveItemId = await readOneDriveItemId(supabase, fileId);

  // Prefer the OneDrive URL when the file is mirrored; on failure fall back to a
  // signed URL for the Supabase copy so preview/download survives an OneDrive
  // outage (expired token / disconnected integration).
  let url: string | null = null;
  if (onedriveItemId) {
    const dl = await getDownloadUrl(file.organization_id, onedriveItemId);
    url = dl?.url ?? null;
  }
  if (!url && file.storage_path) {
    url = await createSignedFileUrl(supabase, file.storage_path, disposition);
  }
  if (!url) {
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  if (disposition === 'attachment') {
    await logActivity({
      actorId: user.id,
      organizationId: file.organization_id,
      action: 'file_download',
      entityType: 'file',
      entityId: fileId,
    });
  }

  return NextResponse.json({
    url,
    mimeType: file.mime_type,
    fileName: file.file_name,
  });
}
