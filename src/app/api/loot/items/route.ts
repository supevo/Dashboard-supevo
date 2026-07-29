import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { FILES_BUCKET } from '@/lib/files/storage';
import { WEIGHT_MIN, WEIGHT_MAX } from '@/features/loot/queries';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const TIERS = ['common', 'rare', 'super'];

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

/** Adds a loot item to a box, with an optional photo of the reward. Admins only. */
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
  const boxTier = String(form.get('boxTier') ?? '');
  if (!TIERS.includes(boxTier)) {
    return NextResponse.json({ error: 'Ungültige Box.' }, { status: 400 });
  }
  const name = String(form.get('name') ?? '').trim().slice(0, 80);
  if (name.length < 2) {
    return NextResponse.json({ error: 'Bitte einen Namen angeben.' }, { status: 400 });
  }
  const description = String(form.get('description') ?? '').trim().slice(0, 300);
  const rawType = String(form.get('type') ?? 'physical');
  const type = rawType === 'badge' ? 'badge' : rawType === 'banner' ? 'banner' : 'physical';
  const weight = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, Number(form.get('weight')) || 10));
  const badgeEmoji = String(form.get('badgeEmoji') ?? '').trim().slice(0, 8);
  const badgeName = String(form.get('badgeName') ?? '').trim().slice(0, 60);
  const bannerImageId = String(form.get('bannerImageId') ?? '').trim();
  const file = form.get('file');

  const service = createSupabaseServiceClient();

  // Banner items must reference an exclusive banner belonging to this org.
  if (type === 'banner') {
    const { data: banner } = await service
      .from('hub_banner_images')
      .select('id, exclusive')
      .eq('id', bannerImageId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!banner) {
      return NextResponse.json({ error: 'Bitte ein Titelbild wählen.' }, { status: 400 });
    }
    if (!banner.exclusive) {
      return NextResponse.json(
        { error: 'Nur als „exklusiv" markierte Titelbilder können Lootbox-Items sein.' },
        { status: 400 },
      );
    }
  }

  const itemId = randomUUID();
  let imagePath: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Das Bild ist zu groß (max. 5 MB).' }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: 'Bitte ein Bild (PNG, JPG, WebP, GIF) wählen.' }, { status: 400 });
    }
    imagePath = `org/${orgId}/loot/item/${itemId}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await service.storage
      .from(FILES_BUCKET)
      .upload(imagePath, bytes, { contentType: file.type, upsert: true });
    if (upErr) {
      logger.error('loot_item.upload_failed', { error: upErr.message });
      return NextResponse.json({ error: `Upload fehlgeschlagen: ${upErr.message}` }, { status: 500 });
    }
  }

  const { error } = await service.from('loot_items').insert({
    id: itemId,
    organization_id: orgId,
    box_tier: boxTier,
    name,
    description: description || null,
    type,
    weight,
    badge_emoji: type === 'badge' ? badgeEmoji || '🏅' : null,
    badge_name: type === 'badge' ? badgeName || name : null,
    image_path: imagePath,
    banner_image_id: type === 'banner' ? bannerImageId : null,
  });
  if (error) {
    if (imagePath) await service.storage.from(FILES_BUCKET).remove([imagePath]);
    return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: itemId });
}
