import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { xpFactor, applyBoost } from '@/features/gamification/xp-boost';

/** Automatic XP awards. Tweak the economy here. */
export const XP_ONTIME = 5; // bonus when finished on or before the due date

/** XP je geschätzter Stunde – die Missions-XP sind strikt proportional dazu. */
export const XP_PER_HOUR = 10;

/**
 * Mission XP, strictly proportional to the task's effort (KI-estimated minutes):
 * XP_PER_HOUR XP per estimated hour, no upper cap – the only fair basis is the
 * estimated time. A 10-min task earns little, a multi-day build earns a lot,
 * always in proportion. Falls back to a mid default (45 min) when no effort is
 * known; minimum 1 so any completed task still counts.
 *
 *   30 min → 5 · 60 min → 10 · 240 min (4 h) → 40 · 480 min → 80 · 2400 → 400
 */
export function missionXpForEffort(minutes: number | null | undefined): number {
  const m = minutes && minutes > 0 ? minutes : 45;
  return Math.max(1, Math.round((m / 60) * XP_PER_HOUR));
}
export const XP_EFFICIENT = 8; // finished within the KI-estimated effort
export const XP_CLIENT_PRAISE = 12; // bonus when the client rates the task ≥ 4★
export const XP_CLIENT_UPDATE = 2; // sending the client a "done" update

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

  // Effort drives the mission XP: a big task is worth more than a 10-min one.
  const { data: t } = await supabase
    .from('tasks')
    .select('estimated_minutes, actual_minutes')
    .eq('id', taskId)
    .maybeSingle();
  const estimate = t?.estimated_minutes ?? null;
  const actual = t?.actual_minutes ?? 0;
  // Prefer the KI estimate; fall back to tracked time; else a mid default.
  const effort = estimate ?? (actual > 0 ? actual : null);

  await insertIgnore(supabase, {
    user_id: userId,
    organization_id: orgId,
    kind: 'mission',
    points: applyBoost(missionXpForEffort(effort), factor),
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

  // Efficient: tracked time stayed within the KI-estimated effort. Rewards the
  // outcome ("delivered promptly"), independent of whether the client engages.
  if (estimate != null && estimate > 0 && actual > 0 && actual <= estimate) {
    await insertIgnore(supabase, {
      user_id: userId,
      organization_id: orgId,
      kind: 'efficient',
      points: applyBoost(XP_EFFICIENT, factor),
      task_id: taskId,
    });
  }

  await awardStreak(supabase, userId, orgId, factor);
}

/**
 * Bonus XP when a client rates a completed task highly (≥ 4★). Awarded to the
 * person who finished the task. Idempotent per task (unique on user+kind+task).
 * A no-op when the task has no completer or the rating is below the bar.
 */
export async function awardClientPraiseXp(params: {
  orgId: string;
  taskId: string;
  stars: number;
}): Promise<void> {
  const { orgId, taskId, stars } = params;
  if (stars < 4) return;
  // Triggered by a client → write via the service client (a client can't insert
  // an XP event for an agency user under RLS).
  const { createSupabaseServiceClient } = await import('@/lib/supabase/service');
  const service = createSupabaseServiceClient();
  const { data: task } = await service
    .from('tasks')
    .select('completed_by')
    .eq('id', taskId)
    .maybeSingle();
  const completer = task?.completed_by;
  if (!completer) return;

  const factor = await xpFactor(orgId);
  const { error } = await service.from('xp_events').insert({
    user_id: completer,
    organization_id: orgId,
    kind: 'client_praise',
    points: applyBoost(XP_CLIENT_PRAISE, factor),
    task_id: taskId,
  });
  if (error && error.code !== '23505') {
    console.error('client_praise xp insert failed', error);
  }
}

/**
 * Small XP for keeping the client in the loop – awarded to the user who sent
 * the "task done" update. Idempotent per task (unique on user+kind+task), so
 * re-sending never double-awards.
 */
export async function awardClientUpdateXp(params: {
  userId: string;
  orgId: string;
  taskId: string;
}): Promise<void> {
  const { userId, orgId, taskId } = params;
  const { createSupabaseServiceClient } = await import('@/lib/supabase/service');
  const service = createSupabaseServiceClient();
  const factor = await xpFactor(orgId);
  const { error } = await service.from('xp_events').insert({
    user_id: userId,
    organization_id: orgId,
    kind: 'client_update',
    points: applyBoost(XP_CLIENT_UPDATE, factor),
    task_id: taskId,
  });
  if (error && error.code !== '23505') {
    console.error('client_update xp insert failed', error);
  }
}
