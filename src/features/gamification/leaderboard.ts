import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { weekInfo } from '@/features/gamification/week';

export interface LeaderRow {
  userId: string;
  name: string;
  hasAvatar: boolean;
  xp: number;
}

export interface XpLeaderboards {
  weekly: LeaderRow[];
  monthly: LeaderRow[];
  allTime: LeaderRow[];
}

const TOP = 25;

/**
 * XP ranking of the org's staff for three periods (this week, this month, all
 * time). XP = automatic XP-ledger points + kudos points received, summed over
 * the period. Service client (org-scoped); caller is agency-gated.
 */
export async function getXpLeaderboards(orgId: string): Promise<XpLeaderboards> {
  const service = createSupabaseServiceClient();
  const weekStart = weekInfo().startIso;
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`;

  const [membersRes, xpRes, kudosRes] = await Promise.all([
    service.from('memberships').select('user_id, role').eq('organization_id', orgId).eq('status', 'active'),
    service.from('xp_events').select('user_id, points, created_at').eq('organization_id', orgId).limit(50000),
    service.from('kudos').select('to_user_id, points, created_at').eq('organization_id', orgId).limit(50000),
  ]);

  const staffIds = new Set(
    (membersRes.data ?? []).filter((m) => m.role !== 'client').map((m) => m.user_id),
  );
  if (staffIds.size === 0) return { weekly: [], monthly: [], allTime: [] };

  const { data: profiles } = await service
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', [...staffIds]);
  const profById = new Map((profiles ?? []).map((p) => [p.id, p] as const));

  const zero = () => ({ week: 0, month: 0, all: 0 });
  const agg = new Map<string, { week: number; month: number; all: number }>();
  const bump = (uid: string, pts: number, at: string) => {
    if (!staffIds.has(uid)) return;
    let a = agg.get(uid);
    if (!a) {
      a = zero();
      agg.set(uid, a);
    }
    a.all += pts;
    if (at >= monthStart) a.month += pts;
    if (at >= weekStart) a.week += pts;
  };

  for (const e of xpRes.data ?? []) bump(e.user_id, e.points ?? 0, e.created_at);
  for (const k of kudosRes.data ?? []) if (k.to_user_id) bump(k.to_user_id, k.points ?? 0, k.created_at);

  const rowsFor = (pick: (a: { week: number; month: number; all: number }) => number): LeaderRow[] =>
    [...staffIds]
      .map((uid) => {
        const p = profById.get(uid);
        return {
          userId: uid,
          name: p?.full_name ?? '—',
          hasAvatar: Boolean(p?.avatar_url),
          xp: pick(agg.get(uid) ?? zero()),
        };
      })
      .filter((r) => r.xp > 0)
      .sort((a, b) => b.xp - a.xp)
      .slice(0, TOP);

  return {
    weekly: rowsFor((a) => a.week),
    monthly: rowsFor((a) => a.month),
    allTime: rowsFor((a) => a.all),
  };
}
