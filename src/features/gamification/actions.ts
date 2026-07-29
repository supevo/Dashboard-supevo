'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { FILES_BUCKET } from '@/lib/files/storage';
import { getXpPoints } from '@/features/gamification/xp';
import { levelForPoints } from '@/features/kudos/badges';
import {
  BANNER_BY_KEY,
  parseCustomBannerKey,
  customBannerKey,
} from '@/features/gamification/banners';

/**
 * Increments a UI-action counter for the current user (for collectible badges).
 * Fire-and-forget: never throws, so a failed count can't break the action that
 * triggered it. Uses an atomic Postgres function so rapid clicks don't lose
 * increments (a read-then-write would).
 */
export async function bumpCounter(key: string): Promise<void> {
  const clean = key.trim().slice(0, 40);
  if (!clean) return;
  try {
    const user = await requireUser();
    const orgId = primaryAgencyOrgId(user);
    if (!orgId) return;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc('bump_counter', { p_key: clean, p_org: orgId });
    if (error) console.error('bumpCounter failed', error);
  } catch (err) {
    console.error('bumpCounter failed', err);
  }
}

/**
 * Quiet auto-presence update from the client tracker. Only sets online/afk and
 * NEVER overrides a manually chosen "Nicht stören" (dnd). No revalidate, so the
 * frequent heartbeat doesn't trigger re-render storms.
 */
export async function setPresenceAction(status: string): Promise<void> {
  const parsed = z.enum(['online', 'afk']).safeParse(status);
  if (!parsed.success) return;
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    // Always refresh last_seen_at (so presence can expire to offline); only
    // change the visible status when the user isn't on "Nicht stören".
    const now = new Date().toISOString();
    await supabase.from('profiles').update({ last_seen_at: now }).eq('id', user.id);
    await supabase
      .from('profiles')
      .update({ status: parsed.data, last_seen_at: now })
      .eq('id', user.id)
      .neq('status', 'dnd');
  } catch {
    /* presence is best-effort */
  }
}

/**
 * Sets the Level-Hub-Titelbild (banner) for the current user. Server-side gate:
 * the banner must exist and be unlocked at the user's current level, so a
 * tampered request can't select a locked one.
 */
export async function setBannerAction(key: string): Promise<void> {
  const clean = key.trim();
  const customId = parseCustomBannerKey(clean);
  const gradient = customId ? null : BANNER_BY_KEY.get(clean);
  if (!customId && !gradient) return;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Level = erhaltene Kudos-Punkte + automatische XP (wie im Hub).
  const [kudosRes, xpPoints] = await Promise.all([
    supabase.from('kudos').select('points').eq('to_user_id', user.id),
    getXpPoints(user.id),
  ]);
  const points =
    (kudosRes.data ?? []).reduce((n, k) => n + (k.points ?? 0), 0) + xpPoints;
  const { level } = levelForPoints(points);

  // Freischalt-Level + zu speichernder Schlüssel je nach Banner-Typ.
  let unlockLevel: number;
  let storeKey: string;
  if (gradient) {
    unlockLevel = gradient.unlockLevel;
    storeKey = gradient.key;
  } else {
    // Bild-Banner: RLS stellt sicher, dass nur Banner der eigenen Org sichtbar sind.
    const { data: img } = await supabase
      .from('hub_banner_images')
      .select('unlock_level, exclusive')
      .eq('id', customId!)
      .maybeSingle();
    if (!img) return;
    storeKey = customBannerKey(customId!);
    if (img.exclusive) {
      // Exklusive Titelbilder gibt es nur über Lootbox: Besitz prüfen statt Level.
      const { data: owned } = await supabase
        .from('achievements')
        .select('id')
        .eq('user_id', user.id)
        .eq('key', `banner_${customId!}`)
        .maybeSingle();
      if (!owned) return;
      unlockLevel = 0;
    } else {
      unlockLevel = img.unlock_level;
    }
  }
  if (level < unlockLevel) return;

  await supabase.from('profiles').update({ hub_banner: storeKey }).eq('id', user.id);
  revalidatePath('/app/kudos');
}

/**
 * Deletes an uploaded Level-Hub banner (row + stored image). RLS restricts the
 * row delete to org admins; the file is removed with the service client.
 */
export async function deleteHubBannerAction(bannerId: string): Promise<void> {
  const parsed = z.string().uuid().safeParse(bannerId);
  if (!parsed.success) return;

  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  if (!orgId || !isOrgAdmin(user, orgId)) return; // admins only

  const service = createSupabaseServiceClient();
  const { data: banner } = await service
    .from('hub_banner_images')
    .select('storage_path')
    .eq('id', parsed.data)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!banner) return;

  await service.from('hub_banner_images').delete().eq('id', parsed.data);
  await service.storage.from(FILES_BUCKET).remove([banner.storage_path]);

  revalidatePath('/app/settings');
  revalidatePath('/app/kudos');
}

/** Sets the current user's presence status (online / afk / dnd). */
export async function setUserStatusAction(status: string): Promise<void> {
  const parsed = z.enum(['online', 'afk', 'dnd']).safeParse(status);
  if (!parsed.success) return;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from('profiles').update({ status: parsed.data }).eq('id', user.id);

  // Collectible badge: count each time the user goes "Do not disturb".
  if (parsed.data === 'dnd') await bumpCounter('dnd');

  revalidatePath('/app');
}
