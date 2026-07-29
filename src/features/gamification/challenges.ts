import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { weekInfo, hashWeek } from '@/features/gamification/week';
import { getActiveCustomChallenges } from '@/features/gamification/custom-challenges';

/**
 * Weekly challenges. A fixed pool; each ISO week three are picked
 * deterministically from a week seed (so it feels random but is stable for the
 * whole week and identical for everyone). Progress is counted within the
 * current week; on completion the user earns XP once, plus – for some – a rare
 * badge. All rewards are idempotent, so re-rendering the Hub never double-grants.
 */
export type WeekMetric =
  | 'missionsWeek'
  | 'createdWeek'
  | 'kudosGivenWeek'
  | 'chatWeek'
  | 'timerWeek'
  | 'ontimeWeek'
  | 'movesWeek';

export interface RareBadge {
  key: string;
  name: string;
  emoji: string;
  reason: string;
}

export interface ChallengeDef {
  key: string;
  title: string;
  emoji: string;
  metric: WeekMetric;
  target: number;
  xp: number;
  rare?: RareBadge;
}

export const CHALLENGE_POOL: ChallengeDef[] = [
  { key: 'sprint', title: 'Wochensprint', emoji: '🏃', metric: 'missionsWeek', target: 10, xp: 50, rare: { key: 'sprinter', name: 'Sprinter', emoji: '🏃‍♂️', reason: 'Challenge „Wochensprint" gemeistert' } },
  { key: 'marathon', title: 'Wochenmarathon', emoji: '🔥', metric: 'missionsWeek', target: 20, xp: 80, rare: { key: 'unaufhaltsam', name: 'Unaufhaltsam', emoji: '🚀', reason: 'Challenge „Wochenmarathon" gemeistert' } },
  { key: 'creator', title: 'Ideenschmiede', emoji: '🛠️', metric: 'createdWeek', target: 5, xp: 30 },
  { key: 'factory', title: 'Vielbeschäftigt', emoji: '🏭', metric: 'createdWeek', target: 15, xp: 50, rare: { key: 'fabrik', name: 'Fabrik', emoji: '🏗️', reason: 'Challenge „Vielbeschäftigt" gemeistert' } },
  { key: 'supporter', title: 'Teamgeist', emoji: '🤝', metric: 'kudosGivenWeek', target: 5, xp: 30, rare: { key: 'herzensgut', name: 'Herzensgut', emoji: '💗', reason: 'Challenge „Teamgeist" gemeistert' } },
  { key: 'chatty', title: 'Kommunikator', emoji: '💬', metric: 'chatWeek', target: 30, xp: 25 },
  { key: 'tracker', title: 'Zeitwächter', emoji: '⏱️', metric: 'timerWeek', target: 10, xp: 25 },
  { key: 'punctual', title: 'Pünktlichkeitsprofi', emoji: '⏰', metric: 'ontimeWeek', target: 5, xp: 40, rare: { key: 'uhrwerk', name: 'Uhrwerk', emoji: '⚙️', reason: 'Challenge „Pünktlichkeitsprofi" gemeistert' } },
  { key: 'organizer', title: 'Aufräumaktion', emoji: '🧹', metric: 'movesWeek', target: 20, xp: 20 },
];

/** All rare badges obtainable through challenges (for the collectible display). */
export const RARE_BADGES: RareBadge[] = CHALLENGE_POOL.flatMap((c) =>
  c.rare ? [c.rare] : [],
);

export interface WeeklyChallenge {
  key: string;
  title: string;
  emoji: string;
  progress: number;
  target: number;
  xp: number;
  done: boolean;
  rareName: string | null;
}

export interface WeeklyChallenges {
  weekLabel: string;
  daysLeft: number;
  challenges: WeeklyChallenge[];
  rareBadges: { key: string; name: string; emoji: string; reason: string; earned: boolean }[];
}

function pickForWeek(seed: number): ChallengeDef[] {
  return [...CHALLENGE_POOL]
    .map((c) => ({ c, r: hashWeek(`${c.key}:${seed}`) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, 3)
    .map((x) => x.c);
}

/**
 * Resolves the current week's three challenges with progress, grants rewards
 * for any that are complete, and reports which rare badges are owned.
 */
export async function getWeeklyChallenges(
  userId: string,
  orgId: string,
): Promise<WeeklyChallenges> {
  // Admin-defined challenges for the current week take precedence over the
  // built-in pool. If none are published for this week, fall back to the pool.
  const custom = await getActiveCustomChallenges(userId, orgId);
  if (custom) {
    return {
      weekLabel: custom.weekLabel,
      daysLeft: custom.daysLeft,
      challenges: custom.challenges.map((c) => ({
        key: c.id,
        title: c.kind === 'team' ? `👥 ${c.title}` : c.title,
        emoji: c.emoji,
        progress: c.progress,
        target: c.target,
        xp: c.xp,
        done: c.done,
        rareName: c.badgeName,
      })),
      rareBadges: custom.badges.map((b) => ({
        key: b.key,
        name: b.name,
        emoji: b.emoji,
        reason: b.name,
        earned: b.earned,
      })),
    };
  }

  const supabase = await createSupabaseServerClient();
  const week = weekInfo();
  const since = week.startIso;
  const head = { count: 'exact' as const, head: true };
  const selected = pickForWeek(week.seed);

  const [
    missionsRes,
    createdRes,
    kudosGivenRes,
    chatRes,
    timerRes,
    ontimeRes,
    movesRes,
    rareRows,
  ] = await Promise.all([
    supabase.from('tasks').select('id', head).eq('completed_by', userId).gte('completed_at', since),
    supabase.from('tasks').select('id', head).eq('created_by', userId).gte('created_at', since),
    supabase.from('kudos').select('id', head).eq('from_user_id', userId).gte('created_at', since),
    supabase.from('client_chat_messages').select('id', head).eq('author_id', userId).gte('created_at', since),
    supabase.from('time_entries').select('id', head).eq('user_id', userId).gte('started_at', since),
    supabase.from('xp_events').select('id', head).eq('user_id', userId).eq('kind', 'ontime').gte('created_at', since),
    supabase.from('activity_log').select('id', head).eq('actor_id', userId).eq('action', 'status_change').gte('created_at', since),
    supabase.from('achievements').select('key').eq('user_id', userId).like('key', 'rare\\_%'),
  ]);

  const counts: Record<WeekMetric, number> = {
    missionsWeek: missionsRes.count ?? 0,
    createdWeek: createdRes.count ?? 0,
    kudosGivenWeek: kudosGivenRes.count ?? 0,
    chatWeek: chatRes.count ?? 0,
    timerWeek: timerRes.count ?? 0,
    ontimeWeek: ontimeRes.count ?? 0,
    movesWeek: movesRes.count ?? 0,
  };

  const ownedRare = new Set((rareRows.data ?? []).map((r) => r.key));

  const challenges: WeeklyChallenge[] = [];
  for (const c of selected) {
    const progress = counts[c.metric] ?? 0;
    const done = progress >= c.target;
    if (done) {
      // XP once per (challenge, week).
      const kind = `chal_${c.key}_${week.id}`;
      const { error } = await supabase.from('xp_events').insert({
        user_id: userId,
        organization_id: orgId,
        kind,
        points: c.xp,
        task_id: null,
      });
      if (error && error.code !== '23505') console.error('challenge xp failed', error);
      // Rare badge once ever.
      if (c.rare && !ownedRare.has(`rare_${c.rare.key}`)) {
        await supabase
          .from('achievements')
          .upsert(
            { user_id: userId, organization_id: orgId, key: `rare_${c.rare.key}` },
            { onConflict: 'user_id,key', ignoreDuplicates: true },
          );
        ownedRare.add(`rare_${c.rare.key}`);
      }
    }
    challenges.push({
      key: c.key,
      title: c.title,
      emoji: c.emoji,
      progress: Math.min(progress, c.target),
      target: c.target,
      xp: c.xp,
      done,
      rareName: c.rare?.name ?? null,
    });
  }

  return {
    weekLabel: `KW ${week.weekNumber}`,
    daysLeft: week.daysLeft,
    challenges,
    rareBadges: RARE_BADGES.map((b) => ({
      key: b.key,
      name: b.name,
      emoji: b.emoji,
      reason: b.reason,
      earned: ownedRare.has(`rare_${b.key}`),
    })),
  };
}
