/**
 * Shared ISO-week helpers used by both the built-in weekly challenges and the
 * admin-defined custom challenges. Kept in its own module to avoid an import
 * cycle between challenges.ts and custom-challenges.ts.
 */

export interface WeekInfo {
  id: string; // e.g. "2026-W31"
  seed: number;
  startIso: string; // Monday 00:00 UTC, ISO
  daysLeft: number;
  weekNumber: number;
}

export function weekInfo(now = new Date()): WeekInfo {
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

/** Monday (YYYY-MM-DD, UTC) of the week containing the given date. */
export function mondayOf(dateIso: string): string {
  const d = new Date(dateIso);
  if (isNaN(d.getTime())) return weekInfo().startIso.slice(0, 10);
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (u.getUTCDay() + 6) % 7;
  u.setUTCDate(u.getUTCDate() - dow);
  return u.toISOString().slice(0, 10);
}

/** Small deterministic string hash → non-negative int. */
export function hashWeek(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
