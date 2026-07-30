import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { createSignedUploadTarget } from '@/lib/files/storage';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { de } from '@/lib/i18n/de';

const MAX_BYTES = 5 * 1024 * 1024;
// Profilrahmen brauchen Transparenz → PNG/WebP/SVG (kein JPG). GIF für Animation.
const ALLOWED = ['image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

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

/**
 * Step 1 of the profile-frame upload: admin-only, returns a one-time signed
 * upload target so the browser sends the image bytes DIRECTLY to storage
 * (bypasses the serverless request-body limit).
 */
export async function POST(request: NextRequest) {
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

  const limit = rateLimit(`frame-upload:${user.id}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: de.errors.RATE_LIMITED },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    mimeType?: string;
    sizeBytes?: number;
  } | null;
  const mimeType = body?.mimeType ?? '';
  const sizeBytes = Number(body?.sizeBytes ?? 0);

  if (!ALLOWED.includes(mimeType)) {
    return NextResponse.json(
      { error: 'Bitte ein transparentes Bild wählen (PNG, WebP, SVG oder GIF).' },
      { status: 400 },
    );
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    return NextResponse.json({ error: 'Das Bild ist zu groß (max. 5 MB).' }, { status: 400 });
  }

  const frameId = randomUUID();
  const storagePath = `org/${orgId}/hub-frame/${frameId}`;

  const supabase = await createSupabaseServerClient();
  const target = await createSignedUploadTarget(supabase, storagePath);
  if (!target) {
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  return NextResponse.json({
    path: target.path,
    token: target.token,
    storagePath,
    frameId,
  });
}
