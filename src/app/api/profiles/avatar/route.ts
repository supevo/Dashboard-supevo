import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { FILES_BUCKET } from '@/lib/files/storage';
import { sanitizeFileName } from '@/lib/files/validation';
import { rateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { de } from '@/lib/i18n/de';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(env.NEXT_PUBLIC_APP_URL).host;
  } catch {
    return false;
  }
}

/**
 * Uploads a profile picture into the (private) files bucket under the user's
 * organization folder and records the storage path on profiles.avatar_url.
 * Avatars are served through /api/profiles/[userId]/avatar (signed URLs).
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

  const orgId = primaryAgencyOrgId(user);
  if (!orgId) {
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  const limit = rateLimit(`avatar:${user.id}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: de.errors.RATE_LIMITED },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
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

  const supabase = await createSupabaseServerClient();

  const storagePath = `org/${orgId}/avatars/${user.id}/${randomUUID()}_${sanitizeFileName(
    file.name,
  )}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  // Remove the previous avatar object (best effort) before repointing.
  const { data: prev } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: storagePath })
    .eq('id', user.id);
  if (updateError) {
    await supabase.storage.from(FILES_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  if (prev?.avatar_url && prev.avatar_url !== storagePath) {
    await supabase.storage.from(FILES_BUCKET).remove([prev.avatar_url]);
  }

  return NextResponse.json({ ok: true });
}
