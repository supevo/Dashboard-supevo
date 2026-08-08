import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { createSignedFileUrl } from '@/lib/files/storage';
import { de } from '@/lib/i18n/de';

/**
 * Redirects to a fresh short-lived signed URL for a page attachment. Because a
 * new URL is minted per request, this works as an <img src> for previews and as
 * a download link (?disposition=attachment). Access is gated by RLS on the
 * attachment row.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('client_page_attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: de.errors.NOT_FOUND }, { status: 404 });
  }
  const storagePath = (data as { storage_path: string }).storage_path;

  const disposition =
    request.nextUrl.searchParams.get('disposition') === 'attachment'
      ? 'attachment'
      : 'inline';

  const signedUrl = await createSignedFileUrl(supabase, storagePath, disposition);
  if (!signedUrl) {
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  return NextResponse.redirect(signedUrl);
}
