import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  listTeamBirthdays,
  type CalendarBirthday,
} from '@/features/birthday/queries';

export interface MyAppointment {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  /** Geschätzte Dauer in Minuten (ohne Zeiten: Standardannahme). */
  minutes: number;
}

/** Minuten zwischen zwei "HH:MM"-Zeiten; ohne/ungültig → Default (60). */
function minutesBetween(start: string | null, end: string | null): number {
  const DEFAULT = 60;
  if (!start || !end) return DEFAULT;
  const [sh, sm] = start.split(':');
  const [eh, em] = end.split(':');
  const startMin = Number(sh) * 60 + Number(sm);
  const endMin = Number(eh) * 60 + Number(em);
  if (Number.isNaN(startMin) || Number.isNaN(endMin)) return DEFAULT;
  const diff = endMin - startMin;
  return diff > 0 ? diff : DEFAULT;
}

/**
 * Termine einer Person an einem Tag: alle Kalender-Termine, bei denen sie
 * Teilnehmer:in ODER Ersteller:in ist. Nimmt den Client als Parameter, damit
 * sowohl RLS-Seiten (Server-Client) als auch Crons (Service-Client) ihn nutzen.
 */
export async function listAppointmentsForUserOnDate(
  client: SupabaseClient<Database>,
  userId: string,
  dateIso: string,
): Promise<MyAppointment[]> {
  const { data: att } = await client
    .from('calendar_event_attendees')
    .select('event_id')
    .eq('user_id', userId);
  const attendeeEventIds = (att ?? []).map((r) => r.event_id);

  const { data: events } = await client
    .from('calendar_events')
    .select('id, title, event_date, start_time, end_time, location, created_by')
    .eq('event_date', dateIso)
    .order('start_time', { ascending: true, nullsFirst: true });

  const mine = (events ?? []).filter(
    (e) => e.created_by === userId || attendeeEventIds.includes(e.id),
  );
  return mine.map((e) => ({
    id: e.id,
    title: e.title,
    date: e.event_date,
    startTime: e.start_time,
    endTime: e.end_time,
    location: e.location,
    minutes: minutesBetween(e.start_time, e.end_time),
  }));
}

/** Summe der Termin-Minuten einer Person an einem Tag (für die Kapazität). */
export async function appointmentMinutesForUser(
  client: SupabaseClient<Database>,
  userId: string,
  dateIso: string,
): Promise<number> {
  const appts = await listAppointmentsForUserOnDate(client, userId, dateIso);
  return appts.reduce((sum, a) => sum + a.minutes, 0);
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  clientName: string | null;
  location: string | null;
  note: string | null;
}

export interface CalendarAbsence {
  id: string;
  date: string; // one entry per covered day in range
  userName: string;
  type: 'urlaub' | 'krank' | 'sonstiges';
}

export interface CalendarDeadline {
  id: string;
  date: string;
  title: string;
  projectName: string;
}

export interface CalendarData {
  events: CalendarEvent[];
  absences: CalendarAbsence[];
  deadlines: CalendarDeadline[];
  birthdays: CalendarBirthday[];
}

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

/** Loads everything shown on the team calendar for the given month range. */
export async function getCalendarData(
  orgId: string,
  fromIso: string,
  toIso: string,
): Promise<CalendarData> {
  const supabase = await createSupabaseServerClient();

  const [{ data: eventRows }, { data: absenceRows }, { data: taskRows }] =
    await Promise.all([
      supabase
        .from('calendar_events')
        .select(
          'id, title, event_date, start_time, end_time, client_company_id, location, note',
        )
        .gte('event_date', fromIso)
        .lte('event_date', toIso)
        .order('event_date', { ascending: true }),
      supabase
        .from('absences')
        .select('id, user_id, type, start_date, end_date')
        .eq('status', 'approved')
        .lte('start_date', toIso)
        .gte('end_date', fromIso),
      supabase
        .from('tasks')
        .select('id, title, project_id, due_date')
        .gte('due_date', fromIso)
        .lte('due_date', toIso)
        .eq('is_archived', false)
        .is('deleted_at', null)
        .limit(500),
    ]);

  // Resolve client names for events.
  const clientIds = [
    ...new Set(
      (eventRows ?? [])
        .map((e) => e.client_company_id)
        .filter((v): v is string => !!v),
    ),
  ];
  const { data: clients } = clientIds.length
    ? await supabase
        .from('client_companies')
        .select('id, name')
        .in('id', clientIds)
    : { data: [] as { id: string; name: string }[] };
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));

  const events: CalendarEvent[] = (eventRows ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    date: e.event_date,
    startTime: hhmm(e.start_time),
    endTime: hhmm(e.end_time),
    clientName: e.client_company_id
      ? (clientName.get(e.client_company_id) ?? null)
      : null,
    location: e.location,
    note: e.note,
  }));

  // Project names for deadlines.
  const projectIds = [...new Set((taskRows ?? []).map((t) => t.project_id))];
  const { data: projects } = projectIds.length
    ? await supabase.from('projects').select('id, name').in('id', projectIds)
    : { data: [] as { id: string; name: string }[] };
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const deadlines: CalendarDeadline[] = (taskRows ?? [])
    .filter((t): t is typeof t & { due_date: string } => Boolean(t.due_date))
    .map((t) => ({
      id: t.id,
      date: t.due_date,
      title: t.title,
      projectName: projectName.get(t.project_id) ?? '—',
    }));

  // Expand absences into one entry per covered day within the range.
  const userIds = [...new Set((absenceRows ?? []).map((a) => a.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? '—'] as const),
  );
  const absences: CalendarAbsence[] = [];
  for (const a of absenceRows ?? []) {
    const start = a.start_date > fromIso ? a.start_date : fromIso;
    const end = a.end_date < toIso ? a.end_date : toIso;
    for (let d = new Date(`${start}T00:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      absences.push({
        id: `${a.id}-${d.toISOString().slice(0, 10)}`,
        date: d.toISOString().slice(0, 10),
        userName: nameById.get(a.user_id) ?? '—',
        type: a.type,
      });
    }
  }

  const birthdays = await listTeamBirthdays(orgId, fromIso, toIso);

  return { events, absences, deadlines, birthdays };
}
