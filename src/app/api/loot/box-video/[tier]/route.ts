import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { FILES_BUCKET } from '@/lib/files/storage';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB – short opening clips
const ALLOWED = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
const TIERS = ['common', 'rare', 'super'] as const;
type Tier = (typeof TIERS)[number];

const COLUMN: Record<Tier, 'video_common' | 'video_rare' | 'video_super'> = {
  common: 'video_common',
  rare: 'video_rare',
  super: 'video_super',
};

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const requestHost = request.headers.get('host') ?? '';
    if (originHost && originHost === requestHost) return true;
    return originHost === new URL(env.NEXT_PUBLIC_APP_URL).host;
  } catch {
    return false;
  }
}

/** Streams a box's opening video, or 404 when none is set. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tier: string }> },
) {
  const { tier } = await params;
  if (!TIERS.includes(tier as Tier)) return new NextResponse(null, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return new NextResponse(null, { status: 404 });

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('loot_config')
    .select(COLUMN[tier as Tier])
    .eq('organization_id', orgId)
    .maybeSingle();
  const path = (data as Record<string, string | null> | null)?.[COLUMN[tier as Tier]];
  if (!path) return new NextResponse(null, { status: 404 });

  const { data: blob } = await service.storage.from(FILES_BUCKET).download(path);
  if (!blob) return new NextResponse(null, { status: 404 });

  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': blob.type || 'video/mp4',
      'Cache-Control': 'private, max-age=300',
      'Accept-Ranges': 'bytes',
    },
  });
}

/** Uploads the opening video for a tier. Admins only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tier: string }> },
) {
  const { tier } = await params;
  if (!TIERS.includes(tier as Tier)) {
    return NextResponse.json({ error: 'Ungültige Box.' }, { status: 400 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Ungültige Herkunft.' }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) {
    return NextResponse.json({ error: 'Keine Admin-Rechte.' }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: 'Bitte ein Video wählen.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Das Video ist zu groß (max. 30 MB).' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Bitte ein Video (MP4, WebM) wählen.' }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const path = `org/${orgId}/loot/video-${tier}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await service.storage
    .from(FILES_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) {
    logger.error('loot_box_video.upload_failed', { error: upErr.message });
    return NextResponse.json({ error: `Upload fehlgeschlagen: ${upErr.message}` }, { status: 500 });
  }

  const patch: {
    organization_id: string;
    updated_at: string;
    video_common?: string;
    video_rare?: string;
    video_super?: string;
  } = {
    organization_id: orgId,
    updated_at: new Date().toISOString(),
  };
  patch[COLUMN[tier as Tier]] = path;
  const { error } = await service.from('loot_config').upsert(patch);
  if (error) {
    return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
