import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

interface WeekInfo {
  id: string;
  seed: number;
  startIso: string;
  daysLeft: number;
  weekNumber: number;
}

function weekInfo(now = new Date()): WeekInfo {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dow);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  const daysLeft = Math.max(1, Math.ceil((nextMonday.getTime() - now.getTime()) / 86_400_000));
  return {
    id: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
    seed: thursday.getUTCFullYear() * 53 + week,
    startIso: monday.toISOString(),
    daysLeft,
    weekNumber: week,
  };
}

/** Small deterministic string hash → non-negative int. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickForWeek(seed: number): ChallengeDef[] {
  return [...CHALLENGE_POOL]
    .map((c) => ({ c, r: hash(`${c.key}:${seed}`) }))
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
