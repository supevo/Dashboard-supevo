import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { FILES_BUCKET } from '@/lib/files/storage';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Storage key for an uploaded hub banner image. */
function bannerStoragePath(orgId: string, bannerId: string): string {
  return `org/${orgId}/hub-banner/${bannerId}`;
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

/** Uploads a new Level-Hub banner image with an unlock level. Org admins only. */
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

  const form = await request.formData();
  const file = form.get('file');
  const name = String(form.get('name') ?? '').trim().slice(0, 80) || 'Titelbild';
  const level = Math.max(0, Math.min(999, Number(form.get('level') ?? 0) || 0));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Das Bild ist zu groß (max. 5 MB).' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: 'Bitte ein Bild (PNG, JPG, WebP, GIF) wählen.' },
      { status: 400 },
    );
  }

  const bannerId = randomUUID();
  const path = bannerStoragePath(orgId, bannerId);
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await createSupabaseServiceClient()
    .storage.from(FILES_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (uploadError) {
    logger.error('hub_banner.upload_failed', { error: uploadError.message });
    return NextResponse.json({ error: de.errors.INTERNAL }, { status: 500 });
  }

  // RLS write policy (is_org_admin) gates the insert.
  const supabase = await createSupabaseServerClient();
  const { error: insertError } = await supabase.from('hub_banner_images').insert({
    id: bannerId,
    organization_id: orgId,
    name,
    unlock_level: level,
    storage_path: path,
    created_by: user.id,
  });
  if (insertError) {
    // Roll back the stored file so we don't leak orphans.
    await createSupabaseServiceClient().storage.from(FILES_BUCKET).remove([path]);
    logger.error('hub_banner.insert_failed', { error: insertError.message });
    return NextResponse.json({ error: de.errors.FORBIDDEN }, { status: 403 });
  }

  return NextResponse.json({ ok: true, id: bannerId });
}
