import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { levelForPoints } from '@/features/kudos/badges';
import { getXpPoints } from '@/features/gamification/xp';
import { resolveActiveFrame, type CustomFrame } from '@/features/gamification/frames';

export type UserStatus = 'online' | 'afk' | 'dnd';

export interface MyGamification {
  points: number;
  level: number;
  /** Progress within the current level, 0–100. */
  progressPct: number;
  status: UserStatus;
  /** Active profile-frame image URL (replaces the XP ring), or null for the ring. */
  frameUrl: string | null;
}

function toStatus(v: string | null | undefined): UserStatus {
  return v === 'afk' || v === 'dnd' ? v : 'online';
}

/**
 * The current user's points, level and self-set status (for the avatar menu).
 * When orgId is given, also resolves the active profile frame (so the sidebar
 * avatar can render the chosen frame instead of the XP ring).
 */
export async function getMyGamification(
  userId: string,
  orgId?: string,
): Promise<MyGamification> {
  const supabase = await createSupabaseServerClient();

  const [{ data: kudos }, { data: profile }, xpPoints] = await Promise.all([
    supabase.from('kudos').select('points').eq('to_user_id', userId),
    supabase
      .from('profiles')
      .select('status, hub_frame')
      .eq('id', userId)
      .maybeSingle(),
    getXpPoints(userId),
  ]);

  const points =
    (kudos ?? []).reduce((s, k) => s + (k.points ?? 0), 0) + xpPoints;
  const { level, progressPct } = levelForPoints(points);

  let frameUrl: string | null = null;
  if (orgId && profile?.hub_frame) {
    const service = createSupabaseServiceClient();
    const [{ data: frames }, { data: owned }] = await Promise.all([
      service
        .from('hub_frame_images')
        .select('id, name, unlock_level, exclusive, coin_price')
        .eq('organization_id', orgId),
      service
        .from('achievements')
        .select('key')
        .eq('user_id', userId)
        .like('key', 'frame_%'),
    ]);
    const ownedIds = new Set(
      (owned ?? []).map((r) => r.key.slice('frame_'.length)),
    );
    const customFrames: CustomFrame[] = (frames ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      unlockLevel: f.unlock_level,
      exclusive: Boolean(f.exclusive),
      owned: ownedIds.has(f.id),
      coinPrice: f.coin_price ?? 0,
    }));
    frameUrl =
      resolveActiveFrame(profile.hub_frame, level, customFrames)?.imageUrl ??
      null;
  }

  return {
    points,
    level,
    progressPct,
    status: toStatus(profile?.status),
    frameUrl,
  };
}
