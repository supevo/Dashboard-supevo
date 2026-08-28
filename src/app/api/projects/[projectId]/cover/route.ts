import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { bumpCounter } from '@/features/gamification/actions';
import { FILES_BUCKET } from '@/lib/files/storage';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';

export const runtime = 'nodejs';

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

// Zielgröße/Format der ausgelieferten Titelbilder. Teil des ETag, damit ein
// geänderter Wert alte Browser-Caches gezielt invalidiert.
const COVER_MAX_DIM = 1600;
const COVER_VARIANT = 'v1-1600-webp-q80';

/** Deterministic storage key for a project's cover image (one per project). */
function coverPath(orgId: string, projectId: string): string {
  return `org/${orgId}/project/${projectId}/cover`;
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    // True same-origin: Origin matches the host the request came in on – works
    // on any domain the app is served from, independent of NEXT_PUBLIC_APP_URL.
    const requestHost = request.headers.get('host') ?? '';
    if (originHost && originHost === requestHost) return true;
    return originHost === new URL(env.NEXT_PUBLIC_APP_URL).host;
  } catch {
    return false;
  }
}

/**
 * Streams the project cover image, downscaled on the fly (max COVER_MAX_DIM,
 * WebP) so pages stay light – this also shrinks covers that were uploaded at
 * full size before client-side downscaling existed. Animated GIFs are served
 * unchanged. Uses an ETag (from the stored file's timestamp) so unchanged
 * covers revalidate with a cheap 304 instead of re-downloading the bytes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return new NextResponse(null, { status: 404 });

  const service = createSupabaseServiceClient();
  const path = coverPath(project.organization_id, projectId);
  const parent = `org/${project.organization_id}/project/${projectId}`;

  // Validator (Änderungszeit des Objekts) für den ETag ermitteln, OHNE den Blob
  // zu laden – so kann ein unveränderter Cache mit 304 (ohne Bytes) antworten.
  let validator = '';
  try {
    const { data: items } = await service.storage
      .from(FILES_BUCKET)
      .list(parent, { search: 'cover', limit: 100 });
    const meta = items?.find((i) => i.name === 'cover');
    validator = meta?.updated_at ?? meta?.created_at ?? '';
  } catch {
    /* ohne Validator kein ETag – dann eben ohne 304 */
  }

  const cacheHeaders: Record<string, string> = {
    'Cache-Control': 'private, max-age=600, stale-while-revalidate=604800',
  };
  let etag: string | undefined;
  if (validator) {
    etag = `"${createHash('sha1').update(validator + COVER_VARIANT).digest('hex').slice(0, 16)}"`;
    cacheHeaders.ETag = etag;
    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }
  }

  let blob: Blob | null = null;
  try {
    const { data } = await service.storage.from(FILES_BUCKET).download(path);
    blob = data;
  } catch (e) {
    logger.warn('cover.download.service_unavailable', {
      error: (e as Error).message,
    });
  }
  if (!blob) {
    const { data } = await supabase.storage.from(FILES_BUCKET).download(path);
    blob = data;
  }
  if (!blob) return new NextResponse(null, { status: 404 });

  const input = Buffer.from(await blob.arrayBuffer());

  // Animierte GIFs unverändert lassen (Verkleinern würde die Animation platten).
  if ((blob.type || '') === 'image/gif') {
    return new NextResponse(new Uint8Array(input), {
      status: 200,
      headers: { ...cacheHeaders, 'Content-Type': 'image/gif' },
    });
  }

  try {
    const out = await sharp(input)
      .rotate() // EXIF-Orientierung anwenden
      .resize(COVER_MAX_DIM, COVER_MAX_DIM, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: { ...cacheHeaders, 'Content-Type': 'image/webp' },
    });
  } catch (e) {
    logger.warn('cover.resize.failed', { error: (e as Error).message });
    return new NextResponse(new Uint8Array(input), {
      status: 200,
      headers: { ...cacheHeaders, 'Content-Type': blob.type || 'image/jpeg' },
    });
  }
}

/** Uploads/replaces the project cover image. Managers only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: de.errors.UNAUTHENTICATED },
      { status: 401 },
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data: canManage } = await supabase.rpc('can_manage_project', {
    p_project_id: projectId,
  });
  if (canManage !== true) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const { data: project } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: de.errors.NOT_FOUND }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
    return NextResponse.json(
      { error: 'Das Bild ist zu groß (max. 5 MB).' },
      { status: 400 },
    );
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: 'Bitte ein Bild (PNG, JPG, WebP, GIF) wählen.' },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const path = coverPath(project.organization_id, projectId);

  // Prefer the service client (fixed-path upsert/overwrite bypasses the
  // insert-only storage RLS). If it is unavailable (service key not set),
  // fall back to the caller's own client — this succeeds for a first upload
  // (INSERT policy); replacing an existing cover then needs the service key.
  let uploadError: string | null = null;
  try {
    const { error } = await createSupabaseServiceClient()
      .storage.from(FILES_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true });
    uploadError = error?.message ?? null;
  } catch (e) {
    uploadError = (e as Error).message;
  }

  if (uploadError) {
    logger.warn('cover.upload.service_failed', { error: uploadError });
    const { error } = await supabase.storage
      .from(FILES_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true });
    if (error) {
      logger.error('cover.upload.fallback_failed', { error: error.message });
      return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
    }
  }

  // Collectible badge "Ach wie hübsch": count project-cover swaps.
  await bumpCounter('cover_swap');

  // A random token invalidates any cached image so the new cover shows.
  return NextResponse.json({ ok: true, token: randomUUID() });
}
