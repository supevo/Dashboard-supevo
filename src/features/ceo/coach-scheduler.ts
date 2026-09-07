import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { completeText, isAiEnabled } from '@/lib/ai/complete';
import { listAppointmentsForUserOnDate } from '@/features/calendar/queries';
import { FOCUS_TARGET_MIN, formatMinutes, quadrantMeta } from './types';

interface Gf {
  userId: string;
  orgId: string;
  firstName?: string;
}

interface CeoRow {
  id: string;
  title: string;
  status: string;
  quadrant: number | null;
  estimate_min: number | null;
  due_date: string | null;
  position: number;
  done_at: string | null;
}

/** Tagesdatum in Europe/Berlin (YYYY-MM-DD). */
function berlinToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Alle aktiven Super-Admins (Geschäftsführer:innen) mit Vorname. */
async function listGfs(service: ReturnType<typeof createSupabaseServiceClient>): Promise<Gf[]> {
  const { data: members } = await service
    .from('memberships')
    .select('user_id, organization_id')
    .eq('role', 'super_admin')
    .eq('status', 'active');
  const rows = (members ?? []) as { user_id: string; organization_id: string }[];
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await service.from('profiles').select('id, full_name').in('id', ids);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? ''] as const));
  return rows.map((r) => ({
    userId: r.user_id,
    orgId: r.organization_id,
    firstName: (nameById.get(r.user_id) ?? '').trim().split(/\s+/)[0] || undefined,
  }));
}

async function loadCeoTasks(
  service: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
): Promise<CeoRow[]> {
  const { data } = await service
    .from('ceo_tasks')
    .select('id, title, status, quadrant, estimate_min, due_date, position, done_at')
    .eq('user_id', userId)
    .limit(500);
  return (data ?? []) as unknown as CeoRow[];
}

/** Angenommener Aufwand einer Karte (fehlt eine Schätzung → 45 Min.). */
function estOf(t: CeoRow): number {
  return t.estimate_min && t.estimate_min > 0 ? t.estimate_min : 45;
}

/** Priorität fürs Auto-Einplanen: überfällig/heute zuerst, dann Eisenhower. */
function priorityScore(t: CeoRow, today: string): number {
  let s = 0;
  if (t.due_date && t.due_date < today) s -= 1000; // überfällig zuerst
  else if (t.due_date === today) s -= 500;
  s += (t.quadrant ?? 5) * 10; // Q1 (1) vor Q4 (4) vor „ohne"
  return s;
}

/** Baut die Coach-Nachricht (KI, mit deterministischem Fallback). */
async function coachMessage(system: string, prompt: string, fallback: string): Promise<string> {
  if (!isAiEnabled()) return fallback;
  try {
    const res = await completeText({ system, prompt, maxTokens: 500 });
    return res?.text?.trim() || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Morgens: füllt die Spalte „Heute" automatisch mit den wichtigsten Karten aus
 * dem Backlog (bis ~Fokus-Ziel) und stupst den/die GF mit dem fertigen Plan an.
 */
export async function runGfCoachMorning(): Promise<{ notified: number }> {
  const service = createSupabaseServiceClient();
  const gfs = await listGfs(service);
  const today = berlinToday();
  let notified = 0;

  for (const gf of gfs) {
    const tasks = await loadCeoTasks(service, gf.userId);
    const open = tasks.filter((t) => t.status !== 'done');

    // Termine des Tages belegen Zeit → weniger freier Fokus für Aufgaben.
    const appts = await listAppointmentsForUserOnDate(service, gf.userId, today);
    const apptMin = appts.reduce((n, a) => n + a.minutes, 0);
    const focusForTasks = Math.max(0, FOCUS_TARGET_MIN - apptMin);

    // Bereits für heute geplant (Heute + In Arbeit).
    const planned = open.filter((t) => t.status === 'today' || t.status === 'doing');
    let plannedMin = planned.reduce((n, t) => n + estOf(t), 0);

    // Kandidaten aus dem Backlog nach Priorität; bis zum (um Termine gekürzten)
    // Fokus-Ziel (max. 6 neue).
    const backlog = open
      .filter((t) => t.status === 'backlog')
      .sort((a, b) => priorityScore(a, today) - priorityScore(b, today) || a.position - b.position);
    const toMove: CeoRow[] = [];
    for (const t of backlog) {
      if (plannedMin >= focusForTasks || toMove.length >= 6) break;
      toMove.push(t);
      plannedMin += estOf(t);
    }
    if (toMove.length > 0) {
      await service
        .from('ceo_tasks')
        .update({ status: 'today', updated_at: new Date().toISOString() } as never)
        .in('id', toMove.map((t) => t.id));
    }

    const todayList = [...planned, ...toMove];
    const lines = todayList
      .slice(0, 8)
      .map((t) => {
        const q = quadrantMeta(t.quadrant);
        return `• ${t.title}${q ? ` (${q.short})` : ''}`;
      })
      .join('\n');
    const apptLines = appts
      .slice(0, 8)
      .map((a) => `📅 ${a.startTime ? a.startTime.slice(0, 5) + ' ' : ''}${a.title}`)
      .join('\n');
    const apptBlock = appts.length > 0 ? `\nTermine (${formatMinutes(apptMin)}):\n${apptLines}` : '';

    const hi = gf.firstName ? ` ${gf.firstName}` : '';
    const fallback =
      todayList.length > 0 || appts.length > 0
        ? `Guten Morgen${hi}!${apptBlock}\n\nFokus-Aufgaben heute (~${formatMinutes(plannedMin)}):\n${lines || '• (keine – die Termine füllen den Tag)'}\n\nWas kommt sonst noch auf deine Agenda? Öffne den GF-Coach, um anzupassen oder „Plane meinen Tag" zu nutzen.`
        : `Guten Morgen${hi}! Dein GF-Board ist leer und keine Termine heute. Was steht an? Trag es kurz ein oder frag den Coach.`;

    const body = await coachMessage(
      `Du bist der persönliche Geschäftsführer-Coach. Formuliere eine kurze, motivierende Morgen-Nachricht auf Deutsch (max. 7 Zeilen). Nenne zuerst die heutigen Termine (falls vorhanden), dann die geplanten Fokus-Aufgaben als Liste, und stelle GENAU EINE Rückfrage, was sonst noch auf die Agenda kommt. Termine belegen Zeit – berücksichtige das im Ton. Kein Markdown außer • und 📅 für die Listen.`,
      `Vorname: ${gf.firstName ?? '—'}${apptBlock}\nGeplanter Fokus (Aufgaben, ~${formatMinutes(plannedMin)}):\n${lines || '(nichts geplant)'}`,
      fallback,
    );

    await createNotifications([
      {
        organizationId: gf.orgId,
        recipientId: gf.userId,
        type: 'gf_coach' as const,
        title: 'GF-Coach · Deine Agenda für heute',
        body,
        entityType: 'gf_coach',
        entityId: gf.userId,
      },
    ]);
    notified += 1;
  }

  return { notified };
}

/**
 * Abends: kurzer Check-in – was wurde heute erledigt, was ist offen. Stupst
 * an, Offenes bewusst auf morgen zu schieben.
 */
export async function runGfCoachEvening(): Promise<{ notified: number }> {
  const service = createSupabaseServiceClient();
  const gfs = await listGfs(service);
  const today = berlinToday();
  let notified = 0;

  for (const gf of gfs) {
    const tasks = await loadCeoTasks(service, gf.userId);
    const doneToday = tasks.filter(
      (t) => t.status === 'done' && (t.done_at ?? '').slice(0, 10) === today,
    );
    const stillOpen = tasks.filter((t) => t.status === 'today' || t.status === 'doing');

    const hi = gf.firstName ? ` ${gf.firstName}` : '';
    const openLines = stillOpen.slice(0, 6).map((t) => `• ${t.title}`).join('\n');
    const fallback =
      stillOpen.length > 0
        ? `Feierabend-Check${hi}: Heute erledigt: ${doneToday.length}. Noch offen (${stillOpen.length}):\n${openLines}\n\nWas schiebt sich auf morgen, was kann weg? Öffne den GF-Coach.`
        : `Feierabend-Check${hi}: Alles von heute erledigt (${doneToday.length}) 🎉. Was nimmst du dir für morgen vor?`;

    const body = await coachMessage(
      `Du bist der persönliche Geschäftsführer-Coach. Formuliere einen kurzen, wertschätzenden Abend-Check auf Deutsch (max. 6 Zeilen): würdige das Erledigte, liste kurz das Offene und stelle GENAU EINE Rückfrage (was schiebt sich auf morgen / was kann weg). Kein Markdown außer • für die Liste.`,
      `Vorname: ${gf.firstName ?? '—'}\nHeute erledigt: ${doneToday.length}\nNoch offen:\n${openLines || '(nichts offen)'}`,
      fallback,
    );

    await createNotifications([
      {
        organizationId: gf.orgId,
        recipientId: gf.userId,
        type: 'gf_coach' as const,
        title: 'GF-Coach · Feierabend-Check',
        body,
        entityType: 'gf_coach',
        entityId: gf.userId,
      },
    ]);
    notified += 1;
  }

  return { notified };
}
