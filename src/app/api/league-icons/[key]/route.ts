import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { FILES_BUCKET } from '@/lib/files/storage';
import { LEAGUES } from '@/features/gamification/leagues';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';

const MAX_ICON_BYTES = 2 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

/** Deterministic storage key for a league's custom icon (one per org+league). */
function iconPath(orgId: string, key: string): string {
  return `org/${orgId}/league-icons/${key}`;
}

function isValidKey(key: string): boolean {
  return LEAGUES.some((l) => l.key === key);
}

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

/** Streams the current org's custom league icon, or 404 when none is set. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!isValidKey(key)) return new NextResponse(null, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return new NextResponse(null, { status: 404 });

  const service = createSupabaseServiceClient();
  const { data: row } = await service
    .from('league_symbols')
    .select('image_path')
    .eq('organization_id', orgId)
    .eq('league_key', key)
    .maybeSingle();
  if (!row?.image_path) return new NextResponse(null, { status: 404 });

  const { data: blob } = await service.storage
    .from(FILES_BUCKET)
    .download(row.image_path);
  if (!blob) return new NextResponse(null, { status: 404 });

  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': blob.type || 'image/png',
      'Cache-Control': 'private, max-age=120',
    },
  });
}

/** Uploads/replaces a league's custom icon. Org admins only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!isValidKey(key)) {
    return NextResponse.json({ error: de.errors.NOT_FOUND }, { status: 404 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_ICON_BYTES) {
    return NextResponse.json(
      { error: 'Das Symbol ist zu groß (max. 2 MB).' },
      { status: 400 },
    );
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: 'Bitte ein Bild (PNG, WebP, GIF, SVG) wählen.' },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const path = iconPath(orgId, key);
  const service = createSupabaseServiceClient();

  const { error: uploadError } = await service.storage
    .from(FILES_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (uploadError) {
    logger.error('league_icon.upload_failed', { error: uploadError.message });
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  // Record the image on the league_symbols row (create it if missing). RLS is
  // the access gate; the service client performs the write.
  const rls = await createSupabaseServerClient();
  const { error: dbError } = await rls
    .from('league_symbols')
    .upsert(
      { organization_id: orgId, league_key: key, image_path: path },
      { onConflict: 'organization_id,league_key' },
    );
  if (dbError) {
    logger.error('league_icon.db_failed', { error: dbError.message });
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  revalidatePath('/app/settings');
  revalidatePath('/app/kudos');
  return NextResponse.json({ ok: true });
}

/** Removes a league's custom icon (falls back to emoji/default). Admins only. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!isValidKey(key)) {
    return NextResponse.json({ error: de.errors.NOT_FOUND }, { status: 404 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  const path = iconPath(orgId, key);
  await service.storage.from(FILES_BUCKET).remove([path]);

  // Clear image_path but keep any custom emoji; delete the row if nothing left.
  const { data: row } = await service
    .from('league_symbols')
    .select('symbol')
    .eq('organization_id', orgId)
    .eq('league_key', key)
    .maybeSingle();

  const rls = await createSupabaseServerClient();
  if (row?.symbol) {
    await rls
      .from('league_symbols')
      .update({ image_path: null })
      .eq('organization_id', orgId)
      .eq('league_key', key);
  } else {
    await rls
      .from('league_symbols')
      .delete()
      .eq('organization_id', orgId)
      .eq('league_key', key);
  }

  revalidatePath('/app/settings');
  revalidatePath('/app/kudos');
  return NextResponse.json({ ok: true });
}
