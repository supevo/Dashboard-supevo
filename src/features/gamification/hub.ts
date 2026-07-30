import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
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
import {
  resolveActiveBanner,
  type CustomBanner,
} from '@/features/gamification/banners';
import {
  resolveActiveFrame,
  type CustomFrame,
  type ResolvedFrame,
} from '@/features/gamification/frames';

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

export interface NamedLevel {
  name: string;
  level: number;
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
  xpIntoLevel: number; // XP earned within the current level
  xpForLevel: number; // XP needed to complete the current level
  league: LeagueStanding;
  daysInCompany: number;
  stats: HubStats;
  radar: RadarSkill[];
  skills: NamedLevel[]; // full skill list (0–10)
  preferences: NamedLevel[]; // Lieblingsarbeit (1–10 hearts)
  objectives: Objective[];
  badges: HubBadge[];
  trophies: HubTrophy[];
  milestones: EarnedAchievement[];
  badgeWall: WallBadge[];
  bannerKey: string; // aktiv angezeigtes Titelbild (Schlüssel)
  bannerBackground: string; // CSS-background für das aktive Titelbild
  customBanners: CustomBanner[]; // hochgeladene Titelbilder der Org (mit Level)
  frame: ResolvedFrame | null; // aktiver Profilrahmen (ersetzt den XP-Ring); null = Ring
  frameKey: string | null; // gewählter Rahmen-Schlüssel (für den Picker)
  customFrames: CustomFrame[]; // hochgeladene Profilrahmen der Org (mit Level)
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
    prefsRes,
    objectives,
    hallOfFame,
    xpPoints,
    milestones,
    badgeWall,
    customBannersRes,
    customFramesRes,
  ] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url, created_at, hub_banner, hub_frame').eq('id', userId).maybeSingle(),
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
    supabase.from('work_preferences').select('name, level').eq('user_id', userId),
    listObjectivesForUser(userId),
    listHallOfFame(orgId, 24),
    getXpPoints(userId),
    listAchievements(userId),
    getBadgeWall(userId, orgId),
    // Org-scoped read via the service client so uploaded banners appear even if
    // the table's RLS select policy is missing.
    createSupabaseServiceClient()
      .from('hub_banner_images')
      .select('id, name, unlock_level, exclusive, coin_price')
      .eq('organization_id', orgId)
      .order('unlock_level', { ascending: true }),
    // Uploaded profile frames (org-scoped via service client).
    createSupabaseServiceClient()
      .from('hub_frame_images')
      .select('id, name, unlock_level, exclusive, coin_price')
      .eq('organization_id', orgId)
      .order('unlock_level', { ascending: true }),
  ]);

  // Exklusive (nur über Lootbox erhältliche) Titelbilder, die diese Person
  // besitzt – als achievements-Einträge 'banner_<bannerId>' gespeichert.
  const { data: ownedBannerRows } = await createSupabaseServiceClient()
    .from('achievements')
    .select('key')
    .eq('user_id', userId)
    .like('key', 'banner_%');
  const ownedBannerIds = new Set(
    (ownedBannerRows ?? []).map((r) => r.key.slice('banner_'.length)),
  );

  const customBanners: CustomBanner[] = (customBannersRes.data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    unlockLevel: b.unlock_level,
    exclusive: Boolean(b.exclusive),
    owned: ownedBannerIds.has(b.id),
    coinPrice: b.coin_price ?? 0,
  }));

  // Owned profile frames (lootbox win / coin purchase) as achievements 'frame_<id>'.
  const { data: ownedFrameRows } = await createSupabaseServiceClient()
    .from('achievements')
    .select('key')
    .eq('user_id', userId)
    .like('key', 'frame_%');
  const ownedFrameIds = new Set(
    (ownedFrameRows ?? []).map((r) => r.key.slice('frame_'.length)),
  );
  const customFrames: CustomFrame[] = (customFramesRes.data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    unlockLevel: f.unlock_level,
    exclusive: Boolean(f.exclusive),
    owned: ownedFrameIds.has(f.id),
    coinPrice: f.coin_price ?? 0,
  }));

  const profile = profileRes.data;
  const received = kudosReceivedRes.data ?? [];
  // Level/XP = peer kudos + automatic XP ledger (missions, on-time, streaks).
  const points = received.reduce((n, k) => n + (k.points ?? 0), 0) + xpPoints;
  const levelInfo = levelForPoints(points);
  const { level, next } = levelInfo;

  const skills = (skillsRes.data ?? [])
    .slice()
    .sort((a, b) => b.level - a.level);
  // One competence point per skill mastered above level 5 (a strong skill),
  // instead of summing all skill points (which produced huge numbers).
  const COMPETENCE_THRESHOLD = 5;
  const competences = skills.filter((s) => (s.level ?? 0) > COMPETENCE_THRESHOLD).length;
  const preferences = (prefsRes.data ?? [])
    .slice()
    .sort((a, b) => b.level - a.level);

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

  // Aktives Titelbild: bewusste Wahl (falls freigeschaltet) sonst höchstes
  // freigeschaltetes – passt sich so automatisch dem Level an.
  const activeBanner = resolveActiveBanner(
    profile?.hub_banner ?? null,
    level,
    customBanners,
  );

  // Aktiver Profilrahmen (ersetzt den XP-Ring). null = Ring bleibt.
  const activeFrame = resolveActiveFrame(
    profile?.hub_frame ?? null,
    level,
    customFrames,
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
    levelProgressPct: levelInfo.progressPct,
    nextLevelPoints: next,
    xpIntoLevel: levelInfo.intoLevel,
    xpForLevel: levelInfo.span,
    league: leagueForPoints(points),
    daysInCompany,
    stats: {
      missions: missionsRes.count ?? 0,
      socialActivity: kudosGivenRes.count ?? 0,
      competences,
      helpfulness: received.length,
    },
    radar: skills.slice(0, 7).map((s) => ({ label: s.name, level: s.level })),
    skills: skills.map((s) => ({ name: s.name, level: s.level })),
    preferences: preferences.map((p) => ({ name: p.name, level: p.level })),
    objectives: objectives.filter((o) => o.status !== 'archived'),
    badges,
    trophies,
    milestones,
    badgeWall,
    bannerKey: activeBanner.key,
    bannerBackground: activeBanner.background,
    customBanners,
    frame: activeFrame,
    frameKey: profile?.hub_frame ?? null,
    customFrames,
  };
}
