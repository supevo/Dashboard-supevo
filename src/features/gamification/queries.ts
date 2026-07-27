import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { levelForPoints } from '@/features/kudos/badges';

export type UserStatus = 'online' | 'afk' | 'dnd';

export interface MyGamification {
  points: number;
  level: number;
  /** Progress within the current level, 0–100. */
  progressPct: number;
  status: UserStatus;
}

function toStatus(v: string | null | undefined): UserStatus {
  return v === 'afk' || v === 'dnd' ? v : 'online';
}

/** The current user's points, level and self-set status (for the avatar menu). */
export async function getMyGamification(userId: string): Promise<MyGamification> {
  const supabase = await createSupabaseServerClient();

  const [{ data: kudos }, { data: profile }] = await Promise.all([
    supabase.from('kudos').select('points').eq('to_user_id', userId),
    supabase.from('profiles').select('status').eq('id', userId).maybeSingle(),
  ]);

  const points = (kudos ?? []).reduce((s, k) => s + (k.points ?? 0), 0);
  const { level } = levelForPoints(points);
  // Points are earned in 100-point levels; progress is the remainder.
  const progressPct = Math.max(0, Math.min(100, points % 100));

  return {
    points,
    level,
    progressPct,
    status: toStatus(profile?.status),
  };
}
