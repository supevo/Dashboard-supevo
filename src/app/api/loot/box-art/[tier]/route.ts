import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { FILES_BUCKET } from '@/lib/files/storage';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const TIERS = ['common', 'rare', 'super'] as const;
type Tier = (typeof TIERS)[number];

const COLUMN: Record<Tier, 'image_common' | 'image_rare' | 'image_super'> = {
  common: 'image_common',
  rare: 'image_rare',
  super: 'image_super',
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

/** Streams the box artwork for a tier, or 404 when none is set. */
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
      'Content-Type': blob.type || 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

/** Uploads the box artwork for a tier. Admins only. */
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
    return NextResponse.json({ error: 'Bitte ein Bild wählen.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Das Bild ist zu groß (max. 5 MB).' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Bitte ein Bild (PNG, JPG, WebP, GIF) wählen.' }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const path = `org/${orgId}/loot/box-${tier}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await service.storage
    .from(FILES_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) {
    logger.error('loot_box_art.upload_failed', { error: upErr.message });
    return NextResponse.json({ error: `Upload fehlgeschlagen: ${upErr.message}` }, { status: 500 });
  }

  const patch: {
    organization_id: string;
    updated_at: string;
    image_common?: string;
    image_rare?: string;
    image_super?: string;
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
