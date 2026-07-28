import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { bumpCounter } from '@/features/gamification/actions';
import { FILES_BUCKET } from '@/lib/files/storage';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Deterministic storage key for a project's cover image (one per project). */
function coverPath(orgId: string, projectId: string): string {
  return `org/${orgId}/project/${projectId}/cover`;
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(env.NEXT_PUBLIC_APP_URL).host;
  } catch {
    return false;
  }
}

/** Streams the project cover image, or 404 when none is set. */
export async function GET(
  _request: NextRequest,
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

  const path = coverPath(project.organization_id, projectId);
  let blob: Blob | null = null;
  try {
    const { data } = await createSupabaseServiceClient()
      .storage.from(FILES_BUCKET)
      .download(path);
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

  const bytes = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': blob.type || 'image/jpeg',
      'Cache-Control': 'private, max-age=120',
    },
  });
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
