import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logger } from '@/lib/logger';

/** Streams an uploaded Level-Hub banner image, or 404 when not accessible. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bannerId: string }> },
) {
  const { bannerId } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  // RLS: only agency staff of the banner's org can read the row.
  const supabase = await createSupabaseServerClient();
  const { data: banner } = await supabase
    .from('hub_banner_images')
    .select('storage_path')
    .eq('id', bannerId)
    .maybeSingle();
  if (!banner) return new NextResponse(null, { status: 404 });

  let blob: Blob | null = null;
  try {
    const { data } = await createSupabaseServiceClient()
      .storage.from(FILES_BUCKET)
      .download(banner.storage_path);
    blob = data;
  } catch (e) {
    logger.warn('hub_banner.download.service_unavailable', {
      error: (e as Error).message,
    });
  }
  if (!blob) {
    const { data } = await supabase.storage
      .from(FILES_BUCKET)
      .download(banner.storage_path);
    blob = data;
  }
  if (!blob) return new NextResponse(null, { status: 404 });

  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': blob.type || 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
