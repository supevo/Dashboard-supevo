import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { xpFactor, applyBoost } from '@/features/gamification/xp-boost';

/** Automatic XP awards. Tweak the economy here. */
export const XP_MISSION = 10; // completing a task
export const XP_ONTIME = 5; // bonus when finished on or before the due date

export const STREAK_MILESTONES: { days: number; kind: string; points: number }[] = [
  { days: 3, kind: 'streak_3', points: 15 },
  { days: 7, kind: 'streak_7', points: 40 },
  { days: 14, kind: 'streak_14', points: 80 },
];

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Sum of a user's automatic XP-ledger points. */
export async function getXpPoints(userId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('xp_events')
    .select('points')
    .eq('user_id', userId);
  return (data ?? []).reduce((n, e) => n + (e.points ?? 0), 0);
}

/** Inserts one XP event, silently ignoring the "already awarded" conflict. */
async function insertIgnore(
  supabase: Supabase,
  row: {
    user_id: string;
    organization_id: string;
    kind: string;
    points: number;
    task_id: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from('xp_events').insert(row);
  // 23505 = unique_violation → event already exists, which is fine (idempotent).
  if (error && error.code !== '23505') {
    console.error('xp_events insert failed', error);
  }
}

/** Longest run of consecutive days (UTC) ending today present in the set. */
function consecutiveDaysEndingToday(days: Set<string>): number {
  let n = 0;
  const d = new Date();
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    n += 1;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}

async function awardStreak(
  supabase: Supabase,
  userId: string,
  orgId: string,
  factor: number,
): Promise<void> {
  const { data } = await supabase
    .from('xp_events')
    .select('created_at')
    .eq('user_id', userId)
    .eq('kind', 'mission')
    .order('created_at', { ascending: false })
    .limit(90);
  const days = new Set((data ?? []).map((e) => e.created_at.slice(0, 10)));
  const streak = consecutiveDaysEndingToday(days);
  for (const m of STREAK_MILESTONES) {
    if (streak >= m.days) {
      await insertIgnore(supabase, {
        user_id: userId,
        organization_id: orgId,
        kind: m.kind,
        points: applyBoost(m.points, factor),
        task_id: null,
      });
    }
  }
}

/**
 * Grants the automatic XP for finishing a task: a base mission award, an
 * on-time bonus when delivered by the due date, and any streak milestone the
 * completion unlocks. All awards are idempotent, so re-completing a task (e.g.
 * after reopening) never double-counts.
 */
export async function awardTaskXp(params: {
  userId: string;
  orgId: string;
  taskId: string;
  dueDate: string | null;
  completedAt: string;
}): Promise<void> {
  const { userId, orgId, taskId, dueDate, completedAt } = params;
  const supabase = await createSupabaseServerClient();

  // Double-XP-Woche: multiply automatic XP while a boost is running.
  const factor = await xpFactor(orgId);

  await insertIgnore(supabase, {
    user_id: userId,
    organization_id: orgId,
    kind: 'mission',
    points: applyBoost(XP_MISSION, factor),
    task_id: taskId,
  });

  // On-time: completed on or before the due date (date-only comparison).
  if (dueDate && completedAt.slice(0, 10) <= dueDate.slice(0, 10)) {
    await insertIgnore(supabase, {
      user_id: userId,
      organization_id: orgId,
      kind: 'ontime',
      points: applyBoost(XP_ONTIME, factor),
      task_id: taskId,
    });
  }

  await awardStreak(supabase, userId, orgId, factor);
}
