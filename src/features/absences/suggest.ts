import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { completeText, isAiEnabled } from '@/lib/ai/complete';

export interface VacationSuggestion {
  start: string;
  end: string;
  reason: string;
}

/** How long the employee wants to be away. */
export type VacationLength = 'few' | 'week' | 'twoweeks';

export function parseVacationLength(v: string | null | undefined): VacationLength {
  return v === 'few' || v === 'twoweeks' ? v : 'week';
}

interface WeekStat {
  index: number;
  start: string; // Monday (YYYY-MM-DD)
  end: string; // Friday
  isoWeek: number;
  deadlines: number;
  teamAbsent: number;
  score: number; // lower is better
}

const WEEKS_AHEAD = 10;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First planning Monday: the first Monday at least two weeks out (no
 *  spontaneous vacation). */
function nextMonday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 14); // skip the first two weeks
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  if (dow !== 0) d.setUTCDate(d.getUTCDate() + (7 - dow));
  return d;
}

function isoWeekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return aS <= bE && bS <= aE;
}

/**
 * Suggests the most sensible vacation window for a user over the next ~10 weeks,
 * weighing their own upcoming deadlines and how many teammates are already away.
 * The desired length is chosen by the employee. A two-week block is only ever
 * proposed when BOTH weeks are truly clear (no own deadlines, nobody else away)
 * – otherwise it falls back to a single week, so long blocks don't tear holes in
 * the planning. Uses AI to pick + explain when available, otherwise a heuristic.
 */
export async function suggestVacation(
  userId: string,
  orgId: string,
  length: VacationLength = 'week',
): Promise<VacationSuggestion | null> {
  const supabase = await createSupabaseServerClient();
  const start0 = nextMonday();
  const windowStart = iso(start0);
  const windowEnd = iso(new Date(start0.getTime() + (WEEKS_AHEAD * 7 + 6) * 86_400_000));

  // The user's own task deadlines in the window.
  const { data: mine } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('user_id', userId);
  const myTaskIds = [...new Set((mine ?? []).map((m) => m.task_id))];
  let deadlineDates: string[] = [];
  if (myTaskIds.length > 0) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('due_date')
      .in('id', myTaskIds)
      .not('due_date', 'is', null)
      .gte('due_date', windowStart)
      .lte('due_date', windowEnd)
      .is('deleted_at', null)
      .eq('is_archived', false);
    deadlineDates = (tasks ?? [])
      .map((t) => t.due_date)
      .filter((v): v is string => !!v);
  }

  // Approved absences of the whole team overlapping the window.
  const { data: absences } = await supabase
    .from('absences')
    .select('user_id, start_date, end_date')
    .eq('organization_id', orgId)
    .eq('status', 'approved')
    .lte('start_date', windowEnd)
    .gte('end_date', windowStart);

  const weeks: WeekStat[] = [];
  for (let i = 0; i < WEEKS_AHEAD; i++) {
    const mon = new Date(start0);
    mon.setUTCDate(mon.getUTCDate() + i * 7);
    const fri = new Date(mon);
    fri.setUTCDate(fri.getUTCDate() + 4);
    const sun = new Date(mon);
    sun.setUTCDate(sun.getUTCDate() + 6);
    const s = iso(mon);
    const e = iso(fri);
    const weekEndSun = iso(sun);

    const deadlines = deadlineDates.filter((d) => d >= s && d <= weekEndSun).length;
    const teamAbsent = new Set(
      (absences ?? [])
        .filter((a) => a.user_id !== userId && overlaps(a.start_date, a.end_date, s, weekEndSun))
        .map((a) => a.user_id),
    ).size;

    weeks.push({
      index: i,
      start: s,
      end: e,
      isoWeek: isoWeekNumber(mon),
      deadlines,
      teamAbsent,
      score: deadlines * 2 + teamAbsent * 3,
    });
  }

  if (weeks.length === 0) return null;

  // Heuristic best single week: lowest score, earliest on a tie.
  const bestWeek = [...weeks].sort(
    (a, b) => a.score - b.score || a.index - b.index,
  )[0]!;

  // A few days = Mon–Wed of the best week.
  if (length === 'few') {
    const wed = new Date(bestWeek.start + 'T00:00:00Z');
    wed.setUTCDate(wed.getUTCDate() + 2);
    return {
      start: bestWeek.start,
      end: iso(wed),
      reason: `KW ${bestWeek.isoWeek}: ruhige Tage – ${bestWeek.deadlines} eigene Deadlines, ${bestWeek.teamAbsent === 0 ? 'niemand' : `${bestWeek.teamAbsent} Kolleg:innen`} sonst abwesend.`,
    };
  }

  // Two weeks: only when BOTH weeks are truly clear (no own deadlines and nobody
  // else away). Otherwise fall back to one week so the plan stays covered.
  if (length === 'twoweeks') {
    let feasible: { start: string; end: string; isoWeek: number } | null = null;
    for (let i = 0; i < weeks.length - 1; i++) {
      const a = weeks[i]!;
      const b = weeks[i + 1]!;
      if (
        a.deadlines === 0 &&
        b.deadlines === 0 &&
        a.teamAbsent === 0 &&
        b.teamAbsent === 0
      ) {
        feasible = { start: a.start, end: b.end, isoWeek: a.isoWeek };
        break;
      }
    }
    if (feasible) {
      return {
        start: feasible.start,
        end: feasible.end,
        reason: `KW ${feasible.isoWeek}–${feasible.isoWeek + 1}: zwei Wochen am Stück machbar – keine eigenen Deadlines und niemand sonst aus dem Team abwesend.`,
      };
    }
    // Not feasible → recommend a single week instead, with a clear note.
    return {
      start: bestWeek.start,
      end: bestWeek.end,
      reason: `Zwei Wochen am Stück sind aktuell nicht machbar (Deadlines/Team-Abwesenheit würden die Planung reißen). Empfehlung: eine Woche in KW ${bestWeek.isoWeek}.`,
    };
  }

  // One week (default).
  const heuristicReason = `KW ${bestWeek.isoWeek}: wenige eigene Deadlines (${bestWeek.deadlines}) und ${bestWeek.teamAbsent === 0 ? 'niemand' : `${bestWeek.teamAbsent} Kolleg:innen`} aus dem Team abwesend – gute Abdeckung.`;

  if (!isAiEnabled()) {
    return { start: bestWeek.start, end: bestWeek.end, reason: heuristicReason };
  }

  // Let the AI pick among the candidate weeks and explain in one sentence.
  const table = weeks
    .map((w) => `#${w.index} KW${w.isoWeek} (${w.start}–${w.end}): Deadlines=${w.deadlines}, Team abwesend=${w.teamAbsent}`)
    .join('\n');
  const ai = await completeText({
    system:
      'Du bist ein Assistent für Urlaubsplanung in einer Agentur. Wähle die günstigste Urlaubswoche: möglichst wenige eigene Deadlines und möglichst wenige gleichzeitig abwesende Kolleg:innen. Antworte ausschließlich als JSON: {"weekIndex": <zahl>, "reason": "<ein kurzer deutscher Satz>"}.',
    prompt: `Kandidatenwochen (Mo–Fr):\n${table}\n\nGib die beste Woche als JSON zurück.`,
    maxTokens: 300,
  });

  if (ai?.text) {
    try {
      const match = ai.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { weekIndex?: number; reason?: string };
        const picked = weeks.find((w) => w.index === parsed.weekIndex);
        if (picked && typeof parsed.reason === 'string' && parsed.reason.trim()) {
          return { start: picked.start, end: picked.end, reason: parsed.reason.trim() };
        }
      }
    } catch {
      /* fall through to heuristic */
    }
  }

  return { start: bestWeek.start, end: bestWeek.end, reason: heuristicReason };
}
