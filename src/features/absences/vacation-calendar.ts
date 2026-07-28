import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Day-level "best time to take vacation" heatmap for the next few months.
 * Each workday is scored green/orange/red from four factors: how many
 * colleagues are already away, deadline density, client meetings and German
 * public holidays (bridge days get a bonus). Weekends and holidays are marked
 * separately. Purely rule-based → deterministic and explainable.
 */
export type DayLevel = 'green' | 'orange' | 'red' | 'holiday' | 'weekend';

export interface VacationDay {
  date: string; // YYYY-MM-DD
  level: DayLevel;
  absent: number;
  deadlines: number;
  events: number;
  bridge: boolean;
  holidayName?: string;
}

export interface VacationCalendar {
  fromISO: string;
  toISO: string;
  days: VacationDay[];
}

const WEEKS = 16;
/** Skip the first two weeks – no spontaneous vacation planning. */
const LEAD_DAYS = 14;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Easter Sunday (UTC) for a year via the Anonymous Gregorian algorithm. */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=März, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** German nationwide public holidays for a year → Map<YYYY-MM-DD, name>. */
function holidaysForYear(year: number): Map<string, string> {
  const m = new Map<string, string>();
  const e = easter(year);
  const add = (d: Date, name: string) => m.set(iso(d), name);
  const shift = (base: Date, days: number) =>
    new Date(base.getTime() + days * 86_400_000);
  add(new Date(Date.UTC(year, 0, 1)), 'Neujahr');
  add(shift(e, -2), 'Karfreitag');
  add(shift(e, 1), 'Ostermontag');
  add(new Date(Date.UTC(year, 4, 1)), 'Tag der Arbeit');
  add(shift(e, 39), 'Christi Himmelfahrt');
  add(shift(e, 50), 'Pfingstmontag');
  add(shift(e, 60), 'Fronleichnam'); // Saarland
  add(new Date(Date.UTC(year, 7, 15)), 'Mariä Himmelfahrt'); // Saarland
  add(new Date(Date.UTC(year, 9, 3)), 'Tag der Deutschen Einheit');
  add(new Date(Date.UTC(year, 10, 1)), 'Allerheiligen'); // Saarland
  add(new Date(Date.UTC(year, 11, 25)), '1. Weihnachtstag');
  add(new Date(Date.UTC(year, 11, 26)), '2. Weihnachtstag');
  return m;
}

export async function getVacationCalendar(
  orgId: string,
  userId: string,
): Promise<VacationCalendar> {
  const supabase = await createSupabaseServerClient();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + LEAD_DAYS);
  const end = new Date(start.getTime() + (WEEKS * 7 - 1) * 86_400_000);
  const fromISO = iso(start);
  const toISO = iso(end);

  const [absRes, taskRes, eventRes] = await Promise.all([
    supabase
      .from('absences')
      .select('user_id, start_date, end_date')
      .eq('organization_id', orgId)
      .eq('status', 'approved')
      .lte('start_date', toISO)
      .gte('end_date', fromISO),
    supabase
      .from('tasks')
      .select('due_date')
      .eq('organization_id', orgId)
      .not('due_date', 'is', null)
      .gte('due_date', fromISO)
      .lte('due_date', toISO)
      .is('deleted_at', null)
      .eq('is_archived', false),
    supabase
      .from('calendar_events')
      .select('event_date')
      .eq('organization_id', orgId)
      .gte('event_date', fromISO)
      .lte('event_date', toISO),
  ]);

  // Per-day tallies.
  const absent = new Map<string, Set<string>>();
  for (const a of absRes.data ?? []) {
    if (a.user_id === userId) continue; // your own leave doesn't reduce coverage
    const s = new Date(`${a.start_date}T00:00:00Z`);
    const e = new Date(`${a.end_date}T00:00:00Z`);
    for (let d = new Date(s); d <= e; d = new Date(d.getTime() + 86_400_000)) {
      const key = iso(d);
      if (key < fromISO || key > toISO) continue;
      (absent.get(key) ?? absent.set(key, new Set()).get(key)!).add(a.user_id);
    }
  }
  const deadlines = new Map<string, number>();
  for (const t of taskRes.data ?? []) {
    if (t.due_date) deadlines.set(t.due_date, (deadlines.get(t.due_date) ?? 0) + 1);
  }
  const events = new Map<string, number>();
  for (const ev of eventRes.data ?? []) {
    events.set(ev.event_date, (events.get(ev.event_date) ?? 0) + 1);
  }

  // Holidays across the spanned years.
  const holidays = new Map<string, string>();
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
    for (const [k, v] of holidaysForYear(y)) holidays.set(k, v);
  }
  const isHoliday = (key: string) => holidays.has(key);
  const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

  const days: VacationDay[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
    const key = iso(d);
    const a = absent.get(key)?.size ?? 0;
    const dl = deadlines.get(key) ?? 0;
    const ev = events.get(key) ?? 0;

    if (holidays.has(key)) {
      days.push({ date: key, level: 'holiday', absent: a, deadlines: dl, events: ev, bridge: false, holidayName: holidays.get(key) });
      continue;
    }
    if (isWeekend(d)) {
      days.push({ date: key, level: 'weekend', absent: a, deadlines: dl, events: ev, bridge: false });
      continue;
    }

    // Bridge day: workday wedged between a holiday and a weekend.
    const prev = new Date(d.getTime() - 86_400_000);
    const next = new Date(d.getTime() + 86_400_000);
    const bridge =
      (isHoliday(iso(prev)) && isWeekend(next)) ||
      (isHoliday(iso(next)) && isWeekend(prev));

    let penalty = a * 3 + dl * 2 + ev * 1;
    if (bridge) penalty -= 3;
    const level: DayLevel = penalty <= 1 ? 'green' : penalty <= 4 ? 'orange' : 'red';
    days.push({ date: key, level, absent: a, deadlines: dl, events: ev, bridge });
  }

  return { fromISO, toISO, days };
}
