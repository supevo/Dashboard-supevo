import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { FILES_BUCKET } from '@/lib/files/storage';
import { logger } from '@/lib/logger';

/** Streams an uploaded profile-frame image, or 404 when not accessible. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ frameId: string }> },
) {
  const { frameId } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  // Read via the service client (independent of the table's RLS select policy),
  // then check the viewer belongs to the frame's organization.
  const service = createSupabaseServiceClient();
  const { data: frame } = await service
    .from('hub_frame_images')
    .select('storage_path, organization_id')
    .eq('id', frameId)
    .maybeSingle();
  if (!frame) return new NextResponse(null, { status: 404 });

  const inOrg = user.memberships.some(
    (m) => m.organizationId === frame.organization_id,
  );
  if (!inOrg) return new NextResponse(null, { status: 404 });

  let blob: Blob | null = null;
  try {
    const { data } = await service.storage
      .from(FILES_BUCKET)
      .download(frame.storage_path);
    blob = data;
  } catch (e) {
    logger.warn('hub_frame.download.service_unavailable', {
      error: (e as Error).message,
    });
  }
  if (!blob) return new NextResponse(null, { status: 404 });

  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': blob.type || 'image/png',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
