import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/features/auth/session';
import { createSignedUploadTarget } from '@/lib/files/storage';
import { validateUpload, buildStoragePath } from '@/lib/files/validation';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { de } from '@/lib/i18n/de';

/** Rejects cross-site POSTs by comparing the Origin header to the app URL. */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(env.NEXT_PUBLIC_APP_URL).host;
  } catch {
    return false;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  EMPTY: 'Die Datei ist leer.',
  TOO_LARGE: 'Die Datei überschreitet die maximale Größe (25 MB).',
  MIME_NOT_ALLOWED: 'Dieser Dateityp ist nicht erlaubt.',
};

/**
 * Step 1 of the direct-to-storage upload: validates access + file constraints
 * and returns a one-time signed upload target. The browser then uploads the
 * bytes straight to Supabase Storage (Step 2) and calls /finalize (Step 3).
 * This bypasses the serverless request-body limit so large files succeed.
 */
export async function POST(request: NextRequest) {
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

  const limit = rateLimit(`upload:${user.id}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: de.errors.RATE_LIMITED },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    projectId?: string;
    taskId?: string | null;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null;

  const projectId = body?.projectId ?? '';
  const taskId = body?.taskId ?? null;
  const fileName = body?.fileName ?? '';
  const mimeType = body?.mimeType ?? '';
  const sizeBytes = Number(body?.sizeBytes ?? 0);

  if (!projectId || !fileName || !mimeType) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }

  const validationError = validateUpload({ size: sizeBytes, type: mimeType });
  if (validationError) {
    return NextResponse.json(
      { error: ERROR_MESSAGES[validationError] ?? de.errors.VALIDATION },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();

  // Verify project access (RLS) and derive the tenant.
  const { data: project } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const storagePath = buildStoragePath({
    organizationId: project.organization_id,
    projectId,
    taskId,
    uuid: randomUUID(),
    fileName,
  });

  const target = await createSignedUploadTarget(supabase, storagePath);
  if (!target) {
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  return NextResponse.json({
    path: target.path,
    token: target.token,
    storagePath,
  });
}
