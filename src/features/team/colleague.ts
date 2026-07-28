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
