import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { xpFactor, applyBoost } from '@/features/gamification/xp-boost';
import { berlinToday } from '@/lib/time';

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Arbeitszeit-Gamification: ein korrektes (selbst durchgeführtes) Ausstempeln an
 * einem echten Arbeitstag gibt XP und baut einen Arbeitszeit-Streak auf. Ein
 * vergessenes Ausstempeln, das automatisch geschlossen wird, gibt weder XP noch
 * zählt es für den Streak – dadurch bricht die Serie.
 */

/** XP fürs korrekte Ausstempeln an einem qualifizierenden Arbeitstag. */
export const XP_WORKDAY = 10;

/** Mindest-Nettoarbeitszeit (Minuten) am Tag, damit ein Tag als Arbeitstag zählt. */
export const WORKDAY_MIN_NET_MINUTES = 4 * 60;

/** Meilensteine für aufeinanderfolgende Arbeitstage (Wochenenden/Abwesenheiten
 *  werden übersprungen, nicht gewertet). */
export const WORK_STREAK_MILESTONES: { days: number; kind: string; points: number }[] = [
  { days: 5, kind: 'work_streak_5', points: 20 },
  { days: 10, kind: 'work_streak_10', points: 50 },
  { days: 20, kind: 'work_streak_20', points: 120 },
];

const WORKDAY_KIND_PREFIX = 'workday:';

function isWeekendIso(iso: string): boolean {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0=So … 6=Sa
  return dow === 0 || dow === 6;
}

/** Inserts one XP event, tolerating the idempotency conflict (23505). */
async function insertIgnore(
  supabase: SupabaseClient,
  row: { user_id: string; organization_id: string; kind: string; points: number },
): Promise<void> {
  const { error } = await supabase
    .from('xp_events')
    .insert({ ...row, task_id: null });
  if (error && error.code !== '23505') {
    console.error('work xp_events insert failed', error);
  }
}

/**
 * Awards the daily work XP for a qualifying, self-completed workday (idempotent
 * per day via the `workday:<date>` kind) and any newly reached work-streak
 * milestone. Call this ONLY on a proper clock-out, never on an auto-close.
 */
export async function awardWorkdayXp(
  supabase: SupabaseClient,
  params: { userId: string; orgId: string; dayIso: string },
): Promise<void> {
  const { userId, orgId, dayIso } = params;
  const factor = await xpFactor(orgId);

  await insertIgnore(supabase, {
    user_id: userId,
    organization_id: orgId,
    kind: `${WORKDAY_KIND_PREFIX}${dayIso}`,
    points: applyBoost(XP_WORKDAY, factor),
  });

  const streak = await getWorkStreak(supabase, userId);
  for (const m of WORK_STREAK_MILESTONES) {
    if (streak >= m.days) {
      await insertIgnore(supabase, {
        user_id: userId,
        organization_id: orgId,
        kind: m.kind,
        points: applyBoost(m.points, factor),
      });
    }
  }
}

/**
 * Current work-time streak = consecutive working days (Mon–Fri, skipping
 * weekends and approved absences) that carry a qualifying workday, ending at the
 * most recent past working day. Today counts once it qualifies but a not-yet-
 * qualified today never breaks the streak. Reads the `workday:<date>` events as
 * the record of qualifying days.
 */
export async function getWorkStreak(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const today = berlinToday();
  const windowStart = addDaysIso(today, -45);

  const { data: events } = await supabase
    .from('xp_events')
    .select('kind')
    .eq('user_id', userId)
    .like('kind', `${WORKDAY_KIND_PREFIX}%`)
    .gte('created_at', `${windowStart}T00:00:00Z`);
  const qualifying = new Set(
    (events ?? []).map((e) => (e.kind as string).slice(WORKDAY_KIND_PREFIX.length)),
  );

  const { data: absences } = await supabase
    .from('absences')
    .select('start_date, end_date')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', windowStart);
  const isAbsent = (iso: string) =>
    (absences ?? []).some((a) => a.start_date <= iso && iso <= a.end_date);

  let streak = 0;
  let iso = today;
  let first = true;
  for (let i = 0; i < 60; i++, iso = addDaysIso(iso, -1)) {
    if (isWeekendIso(iso) || isAbsent(iso)) continue; // skip, never breaks
    if (qualifying.has(iso)) {
      streak += 1;
    } else if (first) {
      // Today (the first working day looked at) may simply not be finished yet.
    } else {
      break;
    }
    first = false;
  }
  return streak;
}
