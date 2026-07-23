import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';

const BUCKET = 'files';
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Secure download: verifies the caller can read the file row (RLS enforces
 * project access + internal visibility), then issues a short-lived signed URL
 * and redirects to it. Files are never served from a public/guessable URL.
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
    .select('storage_path, organization_id, project_id, task_id')
    .eq('id', fileId)
    .is('deleted_at', null)
    .maybeSingle();

  // RLS returns no row when the user may not see this (internal/foreign) file.
  if (!file) {
    return NextResponse.json({ error: de.errors.NOT_FOUND }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: true,
    });
  if (error || !signed) {
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  await logActivity({
    actorId: user.id,
    organizationId: file.organization_id,
    action: 'file_download',
    entityType: 'file',
    entityId: fileId,
  });

  return NextResponse.redirect(signed.signedUrl);
}
