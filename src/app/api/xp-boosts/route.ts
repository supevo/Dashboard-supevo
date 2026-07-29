import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { FILES_BUCKET } from '@/lib/files/storage';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

const MAX_BYTES = 5 * 1024 * 1024;
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

/** Creates an XP boost (Double-XP-Woche) with an optional banner. Admins only. */
export async function POST(request: NextRequest) {
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
  const title = String(form.get('title') ?? '').trim().slice(0, 80) || 'Double XP';
  const factor = Math.max(1, Math.min(10, Number(form.get('factor')) || 2));
  const startsAt = String(form.get('startsAt') ?? '').trim();
  const endsAt = String(form.get('endsAt') ?? '').trim();
  const file = form.get('file');

  const start = startsAt ? new Date(startsAt) : new Date();
  const end = endsAt ? new Date(endsAt) : null;
  if (!end || isNaN(end.getTime()) || isNaN(start.getTime())) {
    return NextResponse.json({ error: 'Bitte Start und Ende angeben.' }, { status: 400 });
  }
  if (end.getTime() <= start.getTime()) {
    return NextResponse.json({ error: 'Ende muss nach dem Start liegen.' }, { status: 400 });
  }

  const boostId = randomUUID();
  const service = createSupabaseServiceClient();
  let bannerPath: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Das Bild ist zu groß (max. 5 MB).' }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: 'Bitte ein Bild (PNG, JPG, WebP, GIF) wählen.' }, { status: 400 });
    }
    bannerPath = `org/${orgId}/xp-boost/${boostId}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await service.storage
      .from(FILES_BUCKET)
      .upload(bannerPath, bytes, { contentType: file.type, upsert: true });
    if (upErr) {
      logger.error('xp_boost.upload_failed', { error: upErr.message });
      return NextResponse.json({ error: `Upload fehlgeschlagen: ${upErr.message}` }, { status: 500 });
    }
  }

  const { error } = await service.from('xp_boosts').insert({
    id: boostId,
    organization_id: orgId,
    title,
    factor,
    banner_path: bannerPath,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    active: true,
    created_by: user.id,
  });
  if (error) {
    if (bannerPath) await service.storage.from(FILES_BUCKET).remove([bannerPath]);
    return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: boostId });
}
