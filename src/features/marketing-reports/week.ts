/**
 * ISO-week helpers for the weekly report period picker. The form uses a native
 * <input type="week"> ("2026-W30"); these turn it into the stored period_start
 * (Monday, yyyy-mm-dd) and a human label ("KW 30 · 21.07.–27.07.2026").
 */

function isoWeekFromYMD(y: number, m: number, d: number): { year: number; week: number } {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fdn = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fdn + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return { year: date.getUTCFullYear(), week };
}

/** Current ISO week as an <input type="week"> value, e.g. "2026-W30". */
export function currentIsoWeek(now = new Date()): string {
  const { year, week } = isoWeekFromYMD(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** ISO week value for a stored yyyy-mm-dd date (used to prefill on edit). */
export function isoWeekOfDateString(s: string): string {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const { year, week } = isoWeekFromYMD(y || 2026, m || 1, d || 1);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Turns "2026-W30" into the Monday date + a German KW label, or null. */
export function weekToPeriod(
  week: string,
): { periodStart: string; periodLabel: string } | null {
  const match = week.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const wk = Number(match[2]);
  if (wk < 1 || wk > 53) return null;

  // Monday of ISO week wk: start from the Monday of the week containing Jan 4.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (wk - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const dd = (x: Date) => String(x.getUTCDate()).padStart(2, '0');
  const mm = (x: Date) => String(x.getUTCMonth() + 1).padStart(2, '0');
  const periodLabel = `KW ${wk} · ${dd(monday)}.${mm(monday)}.–${dd(sunday)}.${mm(sunday)}.${sunday.getUTCFullYear()}`;
  return { periodStart: monday.toISOString().slice(0, 10), periodLabel };
}
