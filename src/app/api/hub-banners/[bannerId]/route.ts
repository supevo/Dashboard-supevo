import { NextResponse, type NextRequest } from 'next/server';
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

  // Read via the service client (independent of the table's RLS select policy),
  // then check the viewer belongs to the banner's organization.
  const service = createSupabaseServiceClient();
  const { data: banner } = await service
    .from('hub_banner_images')
    .select('storage_path, organization_id')
    .eq('id', bannerId)
    .maybeSingle();
  if (!banner) return new NextResponse(null, { status: 404 });

  const inOrg = user.memberships.some(
    (m) => m.organizationId === banner.organization_id,
  );
  if (!inOrg) return new NextResponse(null, { status: 404 });

  let blob: Blob | null = null;
  try {
    const { data } = await service.storage
      .from(FILES_BUCKET)
      .download(banner.storage_path);
    blob = data;
  } catch (e) {
    logger.warn('hub_banner.download.service_unavailable', {
      error: (e as Error).message,
    });
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
