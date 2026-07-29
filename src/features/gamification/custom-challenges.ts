import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { METRIC_BY_KEY } from '@/features/gamification/challenge-metrics';
import { weekInfo } from '@/features/gamification/week';

export type ChallengeKind = 'weekly' | 'team';

export interface CustomChallengeView {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  kind: ChallengeKind;
  progress: number;
  target: number;
  xp: number;
  done: boolean;
  badgeName: string | null;
  badgeEmoji: string | null;
}

export interface CustomChallengesResult {
  weekLabel: string;
  daysLeft: number;
  challenges: CustomChallengeView[];
  badges: { key: string; name: string; emoji: string; earned: boolean }[];
}

/**
 * Resolves the org's admin-defined challenges for the CURRENT week, grants XP +
 * badges for any the user (weekly) or the team (team) has completed, and lists
 * the collectible custom badges. Returns null when no custom challenges are
 * published this week (caller falls back to the built-in pool). All grants are
 * idempotent; reads/writes go through the service client (org-scoped).
 */
export async function getActiveCustomChallenges(
  userId: string,
  orgId: string,
): Promise<CustomChallengesResult | null> {
  const service = createSupabaseServiceClient();
  const week = weekInfo();
  const weekStart = week.startIso.slice(0, 10);
  const since = week.startIso;

  const { data: rows } = await service
    .from('custom_challenges')
    .select('id, title, description, emoji, metric, target, xp, kind, badge_key, badge_name, badge_emoji')
    .eq('organization_id', orgId)
    .eq('active', true)
    .eq('week_start', weekStart)
    .order('created_at', { ascending: true });
  if (!rows || rows.length === 0) return null;

  const { data: ownedRows } = await service
    .from('achievements')
    .select('key')
    .eq('user_id', userId)
    .like('key', 'cbadge\\_%');
  const owned = new Set((ownedRows ?? []).map((r) => r.key));

  const teamCache = new Map<string, number>();
  const challenges: CustomChallengeView[] = [];

  for (const r of rows) {
    const metric = METRIC_BY_KEY.get(r.metric);
    if (!metric) continue;

    let progress: number;
    if (r.kind === 'team') {
      if (!teamCache.has(r.metric)) {
        teamCache.set(r.metric, await metric.teamCount(service, orgId, since));
      }
      progress = teamCache.get(r.metric) ?? 0;
    } else {
      progress = await metric.userCount(service, userId, orgId, since);
    }

    const done = progress >= r.target;
    if (done) {
      // XP once per (challenge, week).
      await service
        .from('xp_events')
        .insert({
          user_id: userId,
          organization_id: orgId,
          kind: `cchal_${r.id}_${week.id}`,
          points: r.xp,
          task_id: null,
        });
      // Badge once ever (idempotent).
      if (r.badge_key) {
        const bkey = `cbadge_${r.badge_key}`;
        if (!owned.has(bkey)) {
          await service
            .from('achievements')
            .upsert(
              { user_id: userId, organization_id: orgId, key: bkey },
              { onConflict: 'user_id,key', ignoreDuplicates: true },
            );
          owned.add(bkey);
        }
      }
    }

    challenges.push({
      id: r.id,
      title: r.title,
      description: r.description,
      emoji: r.emoji,
      kind: r.kind as ChallengeKind,
      progress: Math.min(progress, r.target),
      target: r.target,
      xp: r.xp,
      done,
      badgeName: r.badge_name,
      badgeEmoji: r.badge_emoji,
    });
  }

  // All distinct custom badges of the org (earned coloured, else greyed).
  const { data: badgeRows } = await service
    .from('custom_challenges')
    .select('badge_key, badge_name, badge_emoji')
    .eq('organization_id', orgId)
    .not('badge_key', 'is', null);
  const badgeMap = new Map<string, { name: string; emoji: string }>();
  for (const b of badgeRows ?? []) {
    if (b.badge_key) {
      badgeMap.set(b.badge_key, { name: b.badge_name ?? '', emoji: b.badge_emoji ?? '🏅' });
    }
  }
  const badges = [...badgeMap.entries()].map(([key, v]) => ({
    key,
    name: v.name,
    emoji: v.emoji,
    earned: owned.has(`cbadge_${key}`),
  }));

  return { weekLabel: `KW ${week.weekNumber}`, daysLeft: week.daysLeft, challenges, badges };
}

export interface AdminChallenge {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  metric: string;
  target: number;
  xp: number;
  kind: ChallengeKind;
  badgeKey: string | null;
  badgeName: string | null;
  badgeEmoji: string | null;
  weekStart: string;
  active: boolean;
  isCurrent: boolean;
}

/** All challenges of the org for the admin editor (newest week first). */
export async function listOrgChallenges(orgId: string): Promise<AdminChallenge[]> {
  const service = createSupabaseServiceClient();
  const currentWeek = weekInfo().startIso.slice(0, 10);
  const { data } = await service
    .from('custom_challenges')
    .select('id, title, description, emoji, metric, target, xp, kind, badge_key, badge_name, badge_emoji, week_start, active')
    .eq('organization_id', orgId)
    .order('week_start', { ascending: false })
    .order('created_at', { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    emoji: r.emoji,
    metric: r.metric,
    target: r.target,
    xp: r.xp,
    kind: r.kind as ChallengeKind,
    badgeKey: r.badge_key,
    badgeName: r.badge_name,
    badgeEmoji: r.badge_emoji,
    weekStart: r.week_start,
    active: r.active,
    isCurrent: r.week_start === currentWeek,
  }));
}
