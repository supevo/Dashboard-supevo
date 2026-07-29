import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/features/auth/session';
import { resolveAssetAccess } from '@/features/assets/access';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSignedUploadTarget } from '@/lib/files/storage';
import { validateUpload } from '@/lib/files/validation';
import { buildAssetStoragePath } from '@/lib/files/asset-path';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { de } from '@/lib/i18n/de';

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

/** Step 1 of the asset upload: agency-only, returns a one-time signed target. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: de.errors.UNAUTHENTICATED }, { status: 401 });
  }

  const limit = rateLimit(`asset-upload:${user.id}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: de.errors.RATE_LIMITED },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    clientCompanyId?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null;

  const clientCompanyId = body?.clientCompanyId ?? '';
  const fileName = body?.fileName ?? '';
  const mimeType = body?.mimeType ?? '';
  const sizeBytes = Number(body?.sizeBytes ?? 0);

  if (!clientCompanyId || !fileName || !mimeType) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }

  const validationError = validateUpload({ size: sizeBytes, type: mimeType });
  if (validationError) {
    return NextResponse.json(
      { error: ERROR_MESSAGES[validationError] ?? de.errors.VALIDATION },
      { status: 400 },
    );
  }

  // Agency staff of the company's org OR a client contact may upload.
  const access = await resolveAssetAccess(clientCompanyId);
  if (!access) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const storagePath = buildAssetStoragePath({
    organizationId: access.orgId,
    clientCompanyId,
    uuid: randomUUID(),
    fileName,
  });

  const supabase = await createSupabaseServerClient();
  const target = await createSignedUploadTarget(supabase, storagePath);
  if (!target) {
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  return NextResponse.json({ path: target.path, token: target.token, storagePath });
}
