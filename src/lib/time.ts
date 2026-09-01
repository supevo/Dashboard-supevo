/**
 * Time helpers. All timestamps are stored in UTC; display uses Europe/Berlin.
 */

export const APP_TIME_ZONE = 'Europe/Berlin';

/** Whole minutes between two ISO timestamps (rounded down, min 0). */
export function minutesBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

/** True when two half-open time ranges overlap. Open (null) ends are treated
 *  as +infinity. Pure mirror of the DB exclusion constraint for pre-checks. */
export function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const aS = new Date(aStart).getTime();
  const aE = aEnd ? new Date(aEnd).getTime() : Number.POSITIVE_INFINITY;
  const bS = new Date(bStart).getTime();
  const bE = bEnd ? new Date(bEnd).getTime() : Number.POSITIVE_INFINITY;
  return aS < bE && bS < aE;
}

/** Formats a duration in minutes as e.g. "1h 30m" / "45m". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

/** Formats an ISO timestamp for display in Europe/Berlin. */
export function formatBerlinDateTime(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: APP_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** Formats an ISO timestamp as a Europe/Berlin wall-clock time, e.g. "08:47". */
export function formatBerlinTime(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Minutes since midnight in Europe/Berlin for the given instant (0…1439).
 * 08:45 → 525. Used to grade a clock-in against fixed time thresholds without
 * dragging UTC offsets into the caller.
 */
export function berlinMinutesOfDay(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/** Today's calendar date (YYYY-MM-DD) in Europe/Berlin. */
export function berlinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Returns the UTC ISO instant for the start of "today" in Europe/Berlin. */
export function startOfBerlinDayUtc(now: Date = new Date()): string {
  // Get the Berlin calendar date for `now`.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // YYYY-MM-DD
  // Midnight Berlin -> determine the offset at that date and back it out.
  const berlinMidnightGuess = new Date(`${parts}T00:00:00Z`);
  const offsetMinutes = berlinOffsetMinutes(berlinMidnightGuess);
  return new Date(
    berlinMidnightGuess.getTime() - offsetMinutes * 60000,
  ).toISOString();
}

/** Weekday for the Berlin calendar day of `now`: Mon=1 … Sun=7. */
export function berlinWeekday(now: Date = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    weekday: 'short',
  }).format(now);
  const map: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  return map[name] ?? 1;
}

/** UTC ISO instant for Monday 00:00 (Europe/Berlin) of the current week. */
export function startOfBerlinWeekUtc(now: Date = new Date()): string {
  const wd = berlinWeekday(now); // 1..7
  const todayStart = new Date(startOfBerlinDayUtc(now));
  const monday = new Date(todayStart.getTime() - (wd - 1) * 86_400_000);
  return monday.toISOString();
}

/**
 * Next billing date (YYYY-MM-DD) on/after today for a given day-of-month.
 * If today is already past `day`, rolls to next month. Day is capped at 28 so
 * every month is representable. Used by the membership/Baukasten billing forms.
 */
export function nextBillingDate(day: number, now: Date = new Date()): string {
  let month = now.getMonth();
  if (now.getDate() > day) month += 1;
  const d = new Date(Date.UTC(now.getFullYear(), month, Math.min(day, 28)));
  return d.toISOString().slice(0, 10);
}

/** Europe/Berlin UTC offset (minutes) for a given instant. */
function berlinOffsetMinutes(date: Date): number {
  const tzDate = new Date(
    date.toLocaleString('en-US', { timeZone: APP_TIME_ZONE }),
  );
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
}
