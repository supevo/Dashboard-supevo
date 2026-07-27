import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { levelForPoints } from '@/features/kudos/badges';
import { getXpPoints } from '@/features/gamification/xp';

export interface AchievementDef {
  key: string;
  emoji: string;
  label: string;
}

/** Catalog of automatic milestone badges. Order = display order. */
export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_mission', emoji: '🎯', label: 'Erste Mission' },
  { key: 'missions_10', emoji: '🔟', label: '10 Missionen' },
  { key: 'missions_50', emoji: '🏅', label: '50 Missionen' },
  { key: 'missions_100', emoji: '💯', label: '100 Missionen' },
  { key: 'level_5', emoji: '⭐', label: 'Level 5' },
  { key: 'level_10', emoji: '🌟', label: 'Level 10' },
  { key: 'first_kudos_given', emoji: '🤝', label: 'Erstes Lob vergeben' },
  { key: 'tenure_30', emoji: '📅', label: '30 Tage dabei' },
  { key: 'tenure_365', emoji: '🎂', label: '1 Jahr dabei' },
];

export const ACHIEVEMENT_BY_KEY = new Map(
  ACHIEVEMENTS.map((a) => [a.key, a] as const),
);

export interface EarnedAchievement extends AchievementDef {
  earnedAt: string;
}

/** A user's earned milestone badges, newest first, enriched from the catalog. */
export async function listAchievements(
  userId: string,
): Promise<EarnedAchievement[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('achievements')
    .select('key, earned_at')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  return (data ?? []).map((a) => {
    const def = ACHIEVEMENT_BY_KEY.get(a.key);
    return {
      key: a.key,
      emoji: def?.emoji ?? '🏅',
      label: def?.label ?? a.key,
      earnedAt: a.earned_at,
    };
  });
}

/**
 * Recomputes the user's milestone stats and grants any newly-earned badges.
 * Idempotent: existing badges are ignored on conflict. Called after events that
 * can move the needle (task completion), so time-only milestones like tenure
 * are granted on the user's next activity.
 */
export async function checkAndAwardAchievements(
  userId: string,
  orgId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const [missionsRes, kudosRes, givenRes, memRes, xpPoints] = await Promise.all([
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('completed_by', userId),
    supabase.from('kudos').select('points').eq('to_user_id', userId),
    supabase
      .from('kudos')
      .select('id', { count: 'exact', head: true })
      .eq('from_user_id', userId),
    supabase
      .from('memberships')
      .select('created_at')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .maybeSingle(),
    getXpPoints(userId),
  ]);

  const missions = missionsRes.count ?? 0;
  const points =
    (kudosRes.data ?? []).reduce((n, k) => n + (k.points ?? 0), 0) + xpPoints;
  const { level } = levelForPoints(points);
  const given = givenRes.count ?? 0;
  const tenureDays = memRes.data?.created_at
    ? Math.floor(
        (Date.now() - new Date(memRes.data.created_at).getTime()) / 86_400_000,
      )
    : 0;

  const earned: string[] = [];
  if (missions >= 1) earned.push('first_mission');
  if (missions >= 10) earned.push('missions_10');
  if (missions >= 50) earned.push('missions_50');
  if (missions >= 100) earned.push('missions_100');
  if (level >= 5) earned.push('level_5');
  if (level >= 10) earned.push('level_10');
  if (given >= 1) earned.push('first_kudos_given');
  if (tenureDays >= 30) earned.push('tenure_30');
  if (tenureDays >= 365) earned.push('tenure_365');

  if (earned.length === 0) return;
  const rows = earned.map((key) => ({
    user_id: userId,
    organization_id: orgId,
    key,
  }));
  await supabase
    .from('achievements')
    .upsert(rows, { onConflict: 'user_id,key', ignoreDuplicates: true });
}
