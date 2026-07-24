import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logger } from '@/lib/logger';

/**
 * Serves a profile avatar by streaming the image bytes. The profiles-table RLS
 * (coworker-visible) is the authorization gate. Streaming (rather than
 * redirecting to a signed URL) avoids cross-origin/caching quirks that showed
 * up as a broken-image icon. Returns 404 when there is no avatar.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.avatar_url) return new NextResponse(null, { status: 404 });

  // Download the object: service client first (works for any coworker), then
  // fall back to the caller's own client (same-organization storage RLS).
  const path = profile.avatar_url;
  let blob: Blob | null = null;
  try {
    const { data } = await createSupabaseServiceClient()
      .storage.from(FILES_BUCKET)
      .download(path);
    blob = data;
  } catch (e) {
    logger.warn('avatar.download.service_unavailable', {
      error: (e as Error).message,
    });
  }
  if (!blob) {
    const { data } = await supabase.storage.from(FILES_BUCKET).download(path);
    blob = data;
  }
  if (!blob) return new NextResponse(null, { status: 404 });

  // Return a Buffer (not the Blob) so the body streams reliably on all runtimes.
  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': blob.type || 'image/jpeg',
      // Private (per-user) but cacheable briefly to avoid re-fetching per card.
      'Cache-Control': 'private, max-age=300',
    },
  });
}
