import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { levelForPoints } from '@/features/kudos/badges';
import { leagueForPoints, type LeagueStanding } from '@/features/gamification/leagues';
import { getBadgeWall, type WallBadge } from '@/features/gamification/badge-catalog';

export interface NamedLevel {
  name: string;
  level: number;
}

export interface ColleagueProfile {
  userId: string;
  name: string;
  hasAvatar: boolean;
  status: string | null;
  roleLabel: string;
  joinedAt: string; // ISO date used for tenure
  joinedExplicit: string | null; // the admin-set date, if any (for the editor)
  daysInCompany: number;
  points: number;
  level: number;
  league: LeagueStanding;
  skills: NamedLevel[];
  preferences: NamedLevel[];
  badges: WallBadge[];
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Inhaber:in',
  agency_admin: 'Administrator:in',
  project_manager: 'Projektleitung',
  employee: 'Mitarbeiter:in',
  freelancer: 'Freelancer:in',
  client: 'Kunde',
};

export interface ColleagueListItem {
  userId: string;
  name: string;
  hasAvatar: boolean;
  status: string | null;
  roleLabel: string;
  level: number;
  leagueEmoji: string;
  leagueName: string;
  isSelf: boolean;
}

/**
 * Roster of the org's agency team for the colleague view – every staff member
 * may see it (to open each other's profiles, XP and badges). Guarded: viewer
 * must be agency staff; the privileged client reads cross-user profile data
 * only after that check.
 */
export async function listColleagues(
  orgId: string,
): Promise<ColleagueListItem[]> {
  const viewer = await requireUser();
  if (!hasAgencyAccess(viewer)) return [];

  const service = createSupabaseServiceClient();
  const { data: memberships } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  const staff = (memberships ?? []).filter((m) => m.role !== 'client');
  const ids = [...new Set(staff.map((m) => m.user_id))];
  if (ids.length === 0) return [];

  const [profilesRes, kudosRes, xpRes] = await Promise.all([
    service.from('profiles').select('id, full_name, avatar_url, status').in('id', ids),
    service.from('kudos').select('to_user_id, points').in('to_user_id', ids),
    service.from('xp_events').select('user_id, points').in('user_id', ids),
  ]);

  const pointsById = new Map<string, number>();
  for (const k of kudosRes.data ?? [])
    pointsById.set(k.to_user_id, (pointsById.get(k.to_user_id) ?? 0) + (k.points ?? 0));
  for (const x of xpRes.data ?? [])
    pointsById.set(x.user_id, (pointsById.get(x.user_id) ?? 0) + (x.points ?? 0));

  const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p] as const));
  const roleById = new Map(staff.map((m) => [m.user_id, m.role] as const));

  return ids
    .map((id) => {
      const p = profileById.get(id);
      const pts = pointsById.get(id) ?? 0;
      const league = leagueForPoints(pts);
      return {
        userId: id,
        name: p?.full_name ?? '—',
        hasAvatar: Boolean(p?.avatar_url),
        status: p?.status ?? null,
        roleLabel: ROLE_LABELS[roleById.get(id) ?? 'employee'] ?? 'Mitarbeiter:in',
        level: levelForPoints(pts).level,
        leagueEmoji: league.current.emoji,
        leagueName: league.current.name,
        isSelf: id === viewer.id,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A teammate's public profile for the colleague view. Guarded: the viewer must
 * be agency staff and the target must be a member of the same organization.
 * Uses the service client (after that check) to read cross-user profile data.
 */
export async function getColleagueProfile(
  orgId: string,
  targetUserId: string,
): Promise<ColleagueProfile | null> {
  const viewer = await requireUser();
  if (!hasAgencyAccess(viewer)) return null;

  const service = createSupabaseServiceClient();

  const { data: membership } = await service
    .from('memberships')
    .select('role, joined_company_at, created_at')
    .eq('user_id', targetUserId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!membership) return null; // not a teammate in this org

  const [profileRes, skillsRes, prefsRes, kudosRes, xpRes, badges] = await Promise.all([
    service.from('profiles').select('full_name, avatar_url, status, created_at').eq('id', targetUserId).maybeSingle(),
    service.from('employee_skills').select('name, level').eq('user_id', targetUserId),
    service.from('work_preferences').select('name, level').eq('user_id', targetUserId),
    service.from('kudos').select('points').eq('to_user_id', targetUserId),
    service.from('xp_events').select('points').eq('user_id', targetUserId),
    getBadgeWall(targetUserId, orgId),
  ]);

  const profile = profileRes.data;
  const points =
    (kudosRes.data ?? []).reduce((n, k) => n + (k.points ?? 0), 0) +
    (xpRes.data ?? []).reduce((n, x) => n + (x.points ?? 0), 0);

  const joinedAt =
    membership.joined_company_at ?? membership.created_at ?? profile?.created_at ?? new Date().toISOString();
  const daysInCompany = Math.max(0, Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86_400_000));

  const sortByLevel = (rows: { name: string; level: number }[] | null) =>
    (rows ?? []).slice().sort((a, b) => b.level - a.level).map((r) => ({ name: r.name, level: r.level }));

  return {
    userId: targetUserId,
    name: profile?.full_name ?? '—',
    hasAvatar: Boolean(profile?.avatar_url),
    status: profile?.status ?? null,
    roleLabel: ROLE_LABELS[membership.role] ?? 'Mitarbeiter:in',
    joinedAt,
    joinedExplicit: membership.joined_company_at ?? null,
    daysInCompany,
    points,
    level: levelForPoints(points).level,
    league: leagueForPoints(points),
    skills: sortByLevel(skillsRes.data),
    preferences: sortByLevel(prefsRes.data),
    badges: badges.filter((b) => b.earned),
  };
}
