import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { FILES_BUCKET } from '@/lib/files/storage';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';

const MAX_BYTES = 1 * 1024 * 1024; // 1 MB – stickers are small.
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

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

/** Uploads a chat sticker (team image, ≤ 1 MB). Agency staff only. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const limit = rateLimit(`sticker-upload:${user.id}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: de.errors.RATE_LIMITED },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const form = await request.formData();
  const file = form.get('file');
  const name = String(form.get('name') ?? '').trim().slice(0, 40) || 'Sticker';

  if (!(file instanceof File)) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Das Bild ist zu groß (max. 1 MB).' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: 'Bitte ein Bild (PNG, JPG, WebP, GIF) wählen.' },
      { status: 400 },
    );
  }

  const id = randomUUID();
  const path = `org/${orgId}/chat-sticker/${id}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const service = createSupabaseServiceClient();

  const { error: uploadError } = await service.storage
    .from(FILES_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (uploadError) {
    logger.error('chat_sticker.upload_failed', { error: uploadError.message });
    return NextResponse.json(
      { error: `Upload fehlgeschlagen: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { error: insertError } = await service.from('chat_stickers').insert({
    id,
    organization_id: orgId,
    name,
    storage_path: path,
    created_by: user.id,
  });
  if (insertError) {
    await service.storage.from(FILES_BUCKET).remove([path]);
    logger.error('chat_sticker.insert_failed', { error: insertError.message });
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id });
}
