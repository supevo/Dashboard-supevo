import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface KudoItem {
  id: string;
  fromName: string;
  toName: string;
  toUserId: string;
  fromUserId: string;
  badge: string;
  message: string | null;
  points: number;
  createdAt: string;
}

export interface LeaderRow {
  userId: string;
  name: string;
  points: number;
  count: number;
}

async function nameMap(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', ids);
  return new Map((data ?? []).map((p) => [p.id, p.full_name ?? '—'] as const));
}

/** Agency colleagues in the org (for the kudos recipient picker), minus self. */
export async function listColleagues(
  orgId: string,
  excludeUserId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data: memberships } = await supabase
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  const ids = [
    ...new Set(
      (memberships ?? [])
        .filter((m) => m.role !== 'client' && m.user_id !== excludeUserId)
        .map((m) => m.user_id),
    ),
  ];
  const names = await nameMap(supabase, ids);
  return ids
    .map((id) => ({ id, name: names.get(id) ?? '—' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Recent kudos across the org (team feed). RLS-scoped to agency staff. */
export async function listRecentKudos(limit = 30): Promise<KudoItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('kudos')
    .select('id, from_user_id, to_user_id, badge, message, points, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!data || data.length === 0) return [];
  const ids = [
    ...new Set(data.flatMap((k) => [k.from_user_id, k.to_user_id])),
  ];
  const names = await nameMap(supabase, ids);
  return data.map((k) => ({
    id: k.id,
    fromUserId: k.from_user_id,
    toUserId: k.to_user_id,
    fromName: names.get(k.from_user_id) ?? '—',
    toName: names.get(k.to_user_id) ?? '—',
    badge: k.badge,
    message: k.message,
    points: k.points,
    createdAt: k.created_at,
  }));
}

/** Points leaderboard since a date (default: current month). */
export async function getLeaderboard(sinceIso?: string): Promise<LeaderRow[]> {
  const supabase = await createSupabaseServerClient();
  const since = sinceIso ?? `${new Date().toISOString().slice(0, 7)}-01`;
  const { data } = await supabase
    .from('kudos')
    .select('to_user_id, points, created_at')
    .gte('created_at', `${since}T00:00:00`);
  const agg = new Map<string, { points: number; count: number }>();
  for (const k of data ?? []) {
    const a = agg.get(k.to_user_id) ?? { points: 0, count: 0 };
    a.points += k.points;
    a.count += 1;
    agg.set(k.to_user_id, a);
  }
  const names = await nameMap(supabase, [...agg.keys()]);
  return [...agg.entries()]
    .map(([userId, a]) => ({
      userId,
      name: names.get(userId) ?? '—',
      points: a.points,
      count: a.count,
    }))
    .sort((x, y) => y.points - x.points);
}

export interface KudosStats {
  totalPoints: number;
  count: number;
  badges: string[];
}

/** A user's lifetime kudos totals + distinct badges earned. */
export async function getKudosStats(userId: string): Promise<KudosStats> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('kudos')
    .select('badge, points')
    .eq('to_user_id', userId);
  const totalPoints = (data ?? []).reduce((n, k) => n + k.points, 0);
  const badges = [...new Set((data ?? []).map((k) => k.badge))];
  return { totalPoints, count: data?.length ?? 0, badges };
}
