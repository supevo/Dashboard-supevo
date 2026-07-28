import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { levelForPoints } from '@/features/kudos/badges';
import { leagueForPoints, type LeagueStanding } from '@/features/gamification/leagues';
import { listObjectivesForUser, type Objective } from '@/features/goals/queries';
import { listHallOfFame } from '@/features/awards/queries';
import { BADGE_BY_KEY } from '@/features/kudos/badges';
import { getXpPoints } from '@/features/gamification/xp';
import {
  listAchievements,
  type EarnedAchievement,
} from '@/features/gamification/achievements';
import { getBadgeWall, type WallBadge } from '@/features/gamification/badge-catalog';

export interface HubStats {
  missions: number; // tasks completed by the user
  socialActivity: number; // kudos given
  competences: number; // sum of skill levels
  helpfulness: number; // kudos received
}

export interface RadarSkill {
  label: string;
  level: number; // 0..10
}

export interface HubBadge {
  key: string;
  emoji: string;
  label: string;
  count: number;
}

export interface HubTrophy {
  year: number;
  month: number;
  monthLabel: string;
  value: string;
}

export interface LevelHub {
  name: string;
  hasAvatar: boolean;
  roleLabel: string;
  specialty: string | null; // top skill, used as a pseudo job title
  points: number;
  level: number;
  levelProgressPct: number;
  nextLevelPoints: number;
  league: LeagueStanding;
  daysInCompany: number;
  stats: HubStats;
  radar: RadarSkill[];
  objectives: Objective[];
  badges: HubBadge[];
  trophies: HubTrophy[];
  milestones: EarnedAchievement[];
  badgeWall: WallBadge[];
}

/**
 * Aggregates everything the Level Hub shows for one user: level/XP, league,
 * tenure, four activity stats, the competence radar, KPIs (objectives), earned
 * kudos badges and monthly trophies. All from existing tables (RLS-scoped).
 */
export async function getLevelHub(
  userId: string,
  orgId: string,
): Promise<LevelHub> {
  const supabase = await createSupabaseServerClient();

  const [
    profileRes,
    membershipRes,
    kudosReceivedRes,
    kudosGivenRes,
    skillsRes,
    missionsRes,
    objectives,
    hallOfFame,
    xpPoints,
    milestones,
    badgeWall,
  ] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url, created_at').eq('id', userId).maybeSingle(),
    supabase
      .from('memberships')
      .select('role, created_at, joined_company_at')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .maybeSingle(),
    supabase.from('kudos').select('badge, points').eq('to_user_id', userId),
    supabase.from('kudos').select('id', { count: 'exact', head: true }).eq('from_user_id', userId),
    supabase.from('employee_skills').select('name, level').eq('user_id', userId),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('completed_by', userId),
    listObjectivesForUser(userId),
    listHallOfFame(orgId, 24),
    getXpPoints(userId),
    listAchievements(userId),
    getBadgeWall(userId, orgId),
  ]);

  const profile = profileRes.data;
  const received = kudosReceivedRes.data ?? [];
  // Level/XP = peer kudos + automatic XP ledger (missions, on-time, streaks).
  const points = received.reduce((n, k) => n + (k.points ?? 0), 0) + xpPoints;
  const { level, next } = levelForPoints(points);

  const skills = (skillsRes.data ?? [])
    .slice()
    .sort((a, b) => b.level - a.level);
  const competences = skills.reduce((n, s) => n + (s.level ?? 0), 0);

  // Earned badges with counts, ordered by frequency.
  const badgeCounts = new Map<string, number>();
  for (const k of received) badgeCounts.set(k.badge, (badgeCounts.get(k.badge) ?? 0) + 1);
  const badges: HubBadge[] = [...badgeCounts.entries()]
    .map(([key, count]) => {
      const b = BADGE_BY_KEY.get(key);
      return { key, emoji: b?.emoji ?? '🏅', label: b?.label ?? key, count };
    })
    .sort((a, b) => b.count - a.count);

  const trophies: HubTrophy[] = hallOfFame
    .filter((h) => h.overall.userId === userId)
    .map((h) => ({ year: h.year, month: h.month, monthLabel: h.monthLabel, value: h.overall.value }));

  const joinIso =
    membershipRes.data?.joined_company_at ??
    membershipRes.data?.created_at ??
    profile?.created_at ??
    new Date().toISOString();
  const daysInCompany = Math.max(
    0,
    Math.floor((Date.now() - new Date(joinIso).getTime()) / 86_400_000),
  );

  const roleLabels: Record<string, string> = {
    owner: 'Inhaber:in',
    admin: 'Administrator:in',
    member: 'Mitarbeiter:in',
    client: 'Kunde',
  };

  return {
    name: profile?.full_name ?? '—',
    hasAvatar: Boolean(profile?.avatar_url),
    roleLabel: roleLabels[membershipRes.data?.role ?? 'member'] ?? 'Mitarbeiter:in',
    specialty: skills[0]?.name ?? null,
    points,
    level,
    levelProgressPct: Math.max(0, Math.min(100, points % 100)),
    nextLevelPoints: next,
    league: leagueForPoints(points),
    daysInCompany,
    stats: {
      missions: missionsRes.count ?? 0,
      socialActivity: kudosGivenRes.count ?? 0,
      competences,
      helpfulness: received.length,
    },
    radar: skills.slice(0, 7).map((s) => ({ label: s.name, level: s.level })),
    objectives: objectives.filter((o) => o.status !== 'archived'),
    badges,
    trophies,
    milestones,
    badgeWall,
  };
}
