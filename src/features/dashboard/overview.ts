import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { gatherBriefingContext } from '@/features/briefing/context';
import { getWeeklyWorkSummary } from '@/features/time-tracking/queries';
import { listAppointmentsForUserOnDate } from '@/features/calendar/queries';
import { berlinToday, berlinWeekday } from '@/lib/time';

export interface OverviewToday {
  dueTasks: number;
  plannedTasks: number;
  meetings: number;
  focusGoalMinutes: number;
}

export interface OverviewWeek {
  tasksDone: number;
  tasksTotal: number;
  focusWorkedMinutes: number;
  focusTargetMinutes: number;
  meetingsDone: number;
  meetingsTotal: number;
  /** Gesamtfortschritt (Aufgaben-Quote) in Prozent, 0..100. */
  pct: number;
}

export interface OpenQuestion {
  id: string;
  text: string;
  createdAt: string;
  entityType: string | null;
  entityId: string | null;
}

export interface CurrentTaskRef {
  taskId: string;
  projectId: string;
  title: string;
  clientName: string | null;
  dueLabel: string | null;
}

export interface OverviewData {
  today: OverviewToday;
  week: OverviewWeek;
  openQuestions: OpenQuestion[];
  currentTasks: CurrentTaskRef[];
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Wochentage (Mo–So) als Datums-Strings, ausgehend von heute (Berlin). */
function weekDates(today: string): string[] {
  const wd = berlinWeekday(); // 1 = Mo … 7 = So
  const monday = addDays(today, -(wd - 1));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function dueLabelOf(dueState: string | null, dueDate: string | null, today: string): string | null {
  if (dueState === 'overdue') return 'Überfällig';
  if (dueState === 'today') return 'Heute';
  if (dueDate && dueDate === addDays(today, 1)) return 'Morgen';
  if (dueState === 'soon' && dueDate) {
    const d = new Date(`${dueDate}T00:00:00Z`);
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
  }
  return null;
}

/**
 * Aggregiert alle Kennzahlen für die neue Übersicht: „Heute", Wochenfortschritt,
 * offene Rückfragen und aktuelle Aufgaben. Nutzt vorhandene Quellen (Briefing-
 * Kontext, Arbeitszeit, Kalender, Benachrichtigungen). Jede Teilabfrage ist
 * best-effort – fehlt eine Quelle, bleibt der Wert 0/leer statt zu crashen.
 */
export async function getOverviewData(
  userId: string,
  orgId: string,
): Promise<OverviewData> {
  const supabase = await createSupabaseServerClient();
  const today = berlinToday();

  const [ctx, weekly, todaysMeetings] = await Promise.all([
    gatherBriefingContext(userId),
    getWeeklyWorkSummary(userId, orgId).catch(() => null),
    listAppointmentsForUserOnDate(supabase, userId, today).catch(() => []),
  ]);

  // „Heute": fällige & geplante (eigene aktive) Aufgaben, Meetings, Fokus-Ziel.
  const dueTasks = ctx.counts.overdue + ctx.counts.dueToday;
  const plannedTasks = ctx.tasks.length;
  const targetHours = weekly?.effectiveTargetHours ?? weekly?.targetHours ?? 0;
  const focusGoalMinutes = Math.round((targetHours / 5) * 60);

  // Erledigte Aufgaben diese Woche (von mir abgeschlossen).
  const weekStartIso = new Date(`${weekDates(today)[0]}T00:00:00Z`).toISOString();
  let tasksDone = 0;
  try {
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('completed_by', userId)
      .gte('completed_at', weekStartIso);
    tasksDone = count ?? 0;
  } catch {
    /* Spalten fehlen? → 0 */
  }
  const tasksTotal = tasksDone + plannedTasks;

  // Kundentermine diese Woche (Ist = bis heute, gesamt = ganze Woche).
  const days = weekDates(today);
  let meetingsTotal = 0;
  let meetingsDone = 0;
  try {
    const { data: att } = await supabase
      .from('calendar_event_attendees')
      .select('event_id')
      .eq('user_id', userId);
    const attIds = new Set((att ?? []).map((r) => r.event_id));
    const { data: events } = await supabase
      .from('calendar_events')
      .select('id, event_date, created_by')
      .in('event_date', days);
    for (const e of events ?? []) {
      if (e.created_by !== userId && !attIds.has(e.id)) continue;
      meetingsTotal += 1;
      if (e.event_date <= today) meetingsDone += 1;
    }
  } catch {
    /* keine Kalenderdaten → 0 */
  }

  const pct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;

  // Offene Rückfragen: ungelesene Benachrichtigungen, die eine Antwort von dir
  // erwarten (interne Fragen, Erwähnungen, Kundenkommentare).
  let openQuestions: OpenQuestion[] = [];
  try {
    const { data: notes } = await supabase
      .from('notifications')
      .select('id, title, body, created_at, entity_type, entity_id, type, is_read')
      .eq('recipient_id', userId)
      .eq('is_read', false)
      .in('type', ['internal_question', 'comment_mention', 'client_comment'])
      .order('created_at', { ascending: false })
      .limit(4);
    openQuestions = (notes ?? []).map((n) => ({
      id: n.id,
      text: (n.title as string) || (n.body as string) || 'Rückfrage',
      createdAt: n.created_at as string,
      entityType: (n.entity_type as string | null) ?? null,
      entityId: (n.entity_id as string | null) ?? null,
    }));
  } catch {
    /* Benachrichtigungen nicht lesbar → leer */
  }

  // Aktuelle Aufgaben: eigene, nach Dringlichkeit (aus dem Briefing-Kontext).
  const currentTasks: CurrentTaskRef[] = ctx.tasks.slice(0, 5).map((t) => ({
    taskId: t.id,
    projectId: t.projectId,
    title: t.title,
    clientName: t.clientName,
    dueLabel: dueLabelOf(t.dueState, t.dueDate, today),
  }));

  return {
    today: {
      dueTasks,
      plannedTasks,
      meetings: todaysMeetings.length,
      focusGoalMinutes,
    },
    week: {
      tasksDone,
      tasksTotal,
      focusWorkedMinutes: weekly?.weekMinutes ?? 0,
      focusTargetMinutes: Math.round(targetHours * 60),
      meetingsDone,
      meetingsTotal,
      pct,
    },
    openQuestions,
    currentTasks,
  };
}
