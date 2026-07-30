import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser, primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { FILES_BUCKET } from '@/lib/files/storage';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';

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
 * Step 3 of the profile-frame upload: records the hub_frame_images row after the
 * browser uploaded the image bytes directly to storage. Admin-only.
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

  const body = (await request.json().catch(() => null)) as {
    frameId?: string;
    storagePath?: string;
    name?: string;
    level?: number;
    exclusive?: boolean;
    coinPrice?: number;
  } | null;

  const frameId = body?.frameId ?? '';
  const storagePath = body?.storagePath ?? '';
  const name = String(body?.name ?? '').trim().slice(0, 80) || 'Profilrahmen';
  const exclusive = body?.exclusive === true;
  // Exklusive Rahmen gibt es nur über Lootbox – Level/Coin-Preis entfallen.
  const level = exclusive ? 0 : Math.max(0, Math.min(999, Number(body?.level ?? 0) || 0));
  const coinPrice = exclusive
    ? 0
    : Math.max(0, Math.min(100000, Number(body?.coinPrice ?? 0) || 0));

  // The object must live under this org's frame folder.
  const expectedPrefix = `org/${orgId}/hub-frame/`;
  if (!frameId || !storagePath || !storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: de.errors.VALIDATION }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { error } = await service.from('hub_frame_images').insert({
    id: frameId,
    organization_id: orgId,
    name,
    unlock_level: level,
    exclusive,
    coin_price: coinPrice,
    storage_path: storagePath,
    created_by: user.id,
  });
  if (error) {
    // Roll back the uploaded object so we don't leak orphans.
    try {
      await service.storage.from(FILES_BUCKET).remove([storagePath]);
    } catch {
      /* best-effort */
    }
    logger.error('hub_frame.insert_failed', { error: error.message });
    return NextResponse.json(
      { error: `Speichern in DB fehlgeschlagen: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: frameId });
}
