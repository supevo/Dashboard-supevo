import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { FILES_BUCKET } from '@/lib/files/storage';

/** Streams an XP boost's banner image, or 404 when not accessible. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const service = createSupabaseServiceClient();
  const { data: boost } = await service
    .from('xp_boosts')
    .select('banner_path, organization_id')
    .eq('id', id)
    .maybeSingle();
  if (!boost?.banner_path) return new NextResponse(null, { status: 404 });

  const inOrg = user.memberships.some((m) => m.organizationId === boost.organization_id);
  if (!inOrg) return new NextResponse(null, { status: 404 });

  const { data: blob } = await service.storage.from(FILES_BUCKET).download(boost.banner_path);
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
