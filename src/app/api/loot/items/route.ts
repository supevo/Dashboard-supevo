import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { FILES_BUCKET } from '@/lib/files/storage';
import { WEIGHT_MAX } from '@/features/loot/queries';
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
  const name = String(form.get('name') ?? '').trim().slice(0, 80);
  if (name.length < 2) {
    return NextResponse.json({ error: 'Bitte einen Namen angeben.' }, { status: 400 });
  }
  const description = String(form.get('description') ?? '').trim().slice(0, 300);
  const rawType = String(form.get('type') ?? 'physical');
  const type =
    rawType === 'badge'
      ? 'badge'
      : rawType === 'banner'
        ? 'banner'
        : rawType === 'frame'
          ? 'frame'
          : 'physical';
  // Per-box win weights (0 = not in that box). An item must be in ≥1 box.
  const clampW = (v: FormDataEntryValue | null) =>
    Math.max(0, Math.min(WEIGHT_MAX, Number(v) || 0));
  const weightCommon = clampW(form.get('weightCommon'));
  const weightRare = clampW(form.get('weightRare'));
  const weightSuper = clampW(form.get('weightSuper'));
  if (weightCommon + weightRare + weightSuper <= 0) {
    return NextResponse.json(
      { error: 'Bitte mindestens eine Box-Gewichtung > 0 angeben.' },
      { status: 400 },
    );
  }
  // Legacy columns (box_tier NOT NULL): "home" box = highest weight.
  const legacyTier =
    weightSuper >= weightRare && weightSuper >= weightCommon
      ? 'super'
      : weightRare >= weightCommon
        ? 'rare'
        : 'common';
  const legacyWeight = Math.max(1, weightCommon, weightRare, weightSuper);
  const badgeEmoji = String(form.get('badgeEmoji') ?? '').trim().slice(0, 8);
  const badgeName = String(form.get('badgeName') ?? '').trim().slice(0, 60);
  const bannerImageId = String(form.get('bannerImageId') ?? '').trim();
  const frameImageId = String(form.get('frameImageId') ?? '').trim();
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

  // Frame items must reference an exclusive frame belonging to this org.
  if (type === 'frame') {
    const { data: frame } = await service
      .from('hub_frame_images')
      .select('id, exclusive')
      .eq('id', frameImageId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!frame) {
      return NextResponse.json({ error: 'Bitte einen Rahmen wählen.' }, { status: 400 });
    }
    if (!frame.exclusive) {
      return NextResponse.json(
        { error: 'Nur als „exklusiv" markierte Rahmen können Lootbox-Items sein.' },
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
    box_tier: legacyTier,
    name,
    description: description || null,
    type,
    weight: legacyWeight,
    weight_common: weightCommon,
    weight_rare: weightRare,
    weight_super: weightSuper,
    badge_emoji: type === 'badge' ? badgeEmoji || '🏅' : null,
    badge_name: type === 'badge' ? badgeName || name : null,
    image_path: imagePath,
    banner_image_id: type === 'banner' ? bannerImageId : null,
    frame_image_id: type === 'frame' ? frameImageId : null,
  } as never);
  if (error) {
    if (imagePath) await service.storage.from(FILES_BUCKET).remove([imagePath]);
    return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: itemId });
}
