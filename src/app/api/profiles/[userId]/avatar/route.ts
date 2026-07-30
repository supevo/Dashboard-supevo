import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
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
 *
 * Freshness: the storage path carries a random UUID that changes on every
 * upload, so we derive an ETag from it and answer with `no-cache`. The browser
 * then revalidates on each use and gets a cheap 304 while the picture is
 * unchanged, but the new avatar shows up immediately everywhere after a swap –
 * no stale (old) image lingering behind a stable URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  // Resolve the avatar path via the service client: a client must be able to see
  // agency authors' avatars (e.g. on comments), which the profiles RLS
  // ("coworker-visible") would otherwise block. Any authenticated user may fetch
  // an avatar by id — avatars are low-sensitivity and shown across the app.
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await createSupabaseServiceClient()
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.avatar_url) return new NextResponse(null, { status: 404 });

  // ETag from the (upload-unique) storage path. Revalidation short-circuits
  // here without touching storage when the client already has this version.
  const etag = `"${createHash('sha1').update(profile.avatar_url).digest('hex').slice(0, 16)}"`;
  const cacheHeaders = { 'Cache-Control': 'private, no-cache', ETag: etag };
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: cacheHeaders });
  }

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
      ...cacheHeaders,
      'Content-Type': blob.type || 'image/jpeg',
    },
  });
}
