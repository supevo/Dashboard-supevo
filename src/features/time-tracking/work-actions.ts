'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { logger } from '@/lib/logger';
import { bumpCounter } from '@/features/gamification/actions';
import { autoCloseSession } from '@/features/time-tracking/auto-close';
import {
  awardWorkdayXp,
  WORKDAY_MIN_NET_MINUTES,
} from '@/features/gamification/work-xp';
import {
  assignClockOutChores,
  flagMissedChoresOnClockIn,
} from '@/features/office-chores/queries';
import {
  assignClockOutBinTask,
  flagMissedBinTasksOnClockIn,
} from '@/features/bins/queries';
import {
  startOfBerlinDayUtc,
  berlinToday,
  berlinMinutesOfDay,
  berlinWeekday,
} from '@/lib/time';
import { createNotifications } from '@/features/notifications/create';
import {
  lateTierForMinutes,
  lateNoticeText,
  LATE_XP,
  LATE_LABEL,
  type LateTier,
} from '@/features/time-tracking/lateness';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const orgSchema = z.object({ orgId: z.string().uuid() });

/**
 * A forgotten clock-out leaves a session open for days. The status widget only
 * looks at today's sessions, so it shows "clocked out" while the stale row is
 * still open – blocking a new clock-in (unique open-session index). On the next
 * clock-in we recover by auto-closing any session left open from a previous day
 * (crediting a normal 8 h workday, marking it auto-closed and notifying the
 * employee – same path the hourly cron uses). Employees/admins can still adjust
 * via a manual entry if needed.
 */
async function autoCloseStaleSession(userId: string): Promise<void> {
  // Use the service client (like the hourly cron) so the recovery close never
  // depends on the caller's row-level permissions, and isolate each close so a
  // single failure can't abort the clock-in that follows.
  const service = createSupabaseServiceClient();
  const dayStart = startOfBerlinDayUtc();
  const { data: openRows } = await service
    .from('work_sessions')
    .select('id, organization_id, user_id, clock_in')
    .eq('user_id', userId)
    .is('clock_out', null)
    .lt('clock_in', dayStart); // only sessions NOT started today
  // Close every leftover (usually one, but be robust against several).
  for (const open of openRows ?? []) {
    try {
      await autoCloseSession(service, open);
    } catch (e) {
      logger.warn('clock_in.stale_close_failed', {
        sessionId: open.id,
        error: (e as Error).message,
      });
    }
  }
}

/**
 * Last-resort recovery: hard-close every open session from a previous day for
 * this user (service client, minimal write, no notification). Runs only when a
 * clock-in still hits the unique open-session index despite the normal
 * auto-close above – guarantees a forgotten session can never permanently block
 * a new clock-in. Sessions started today are left untouched (handled as a
 * no-op earlier), so this never closes a genuinely active session.
 */
async function forceCloseStaleSessions(userId: string): Promise<void> {
  const service = createSupabaseServiceClient();
  await service
    .from('work_sessions')
    .update({ clock_out: new Date().toISOString(), status: 'closed' })
    .eq('user_id', userId)
    .is('clock_out', null)
    .lt('clock_in', startOfBerlinDayUtc());
}

export async function clockInAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = orgSchema.safeParse({ orgId: formData.get('orgId') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Recover from a forgotten clock-out (session left open on a previous day).
  await autoCloseStaleSession(user.id);

  // Idempotency: if a session started today is still open (e.g. an auto-logout
  // closed the widget UI but left today's row open), treat clock-in as a no-op
  // instead of hitting the unique open-session index → hard error. The status
  // widget only inspects today's sessions, so this reconciles the two.
  const { data: openToday } = await supabase
    .from('work_sessions')
    .select('id')
    .eq('user_id', user.id)
    .is('clock_out', null)
    .gte('clock_in', startOfBerlinDayUtc())
    .maybeSingle();
  if (openToday) {
    revalidatePath('/app/time');
    return successResult('Du bist bereits eingestempelt.');
  }

  // Pünktlichkeit wird nur am ERSTEN Stempel des Tages gewertet: ein zweiter
  // Clock-in nach einer Mittagspause (ausstempeln → wieder ein) darf keinen
  // Verspätungs-Abzug auslösen. Vor dem Insert prüfen, ob heute schon gestempelt
  // wurde.
  const { count: priorToday } = await supabase
    .from('work_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('clock_in', startOfBerlinDayUtc());
  const isFirstToday = (priorToday ?? 0) === 0;

  const clockInIso = new Date().toISOString();
  const newSession = {
    organization_id: parsed.data.orgId,
    user_id: user.id,
    clock_in: clockInIso,
    status: 'active' as const,
  };
  let { data: inserted, error } = await supabase
    .from('work_sessions')
    .insert(newSession)
    .select('id')
    .single();

  // If the unique open-session index still rejects the insert, a stale session
  // slipped through the normal recovery (e.g. a schema quirk). Force-close any
  // leftover from a previous day and retry once so a forgotten clock-out can
  // never permanently block the employee.
  if (error) {
    await forceCloseStaleSessions(user.id);
    ({ data: inserted, error } = await supabase
      .from('work_sessions')
      .insert(newSession)
      .select('id')
      .single());
  }
  // Only a genuine still-open session from TODAY can remain now.
  if (error || !inserted) {
    return errorResult('Es läuft bereits eine Arbeitszeitsitzung.');
  }
  const sessionId = inserted.id;

  // Verspätung bewerten: nur der erste Stempel, nur an Werktagen, und nicht bei
  // genehmigter Abwesenheit (z. B. halber Urlaubstag). Der Abzug/die Meldung
  // erfolgt in `after`, aber die Stufe wird synchron bestimmt, damit die
  // Bestätigungsmeldung den Hinweis direkt enthält.
  const isWeekend = berlinWeekday(new Date(clockInIso)) >= 6;
  let tier: LateTier | null =
    isFirstToday && !isWeekend
      ? lateTierForMinutes(berlinMinutesOfDay(new Date(clockInIso)))
      : null;
  if (tier && (await hasApprovedAbsenceToday(supabase, user.id))) {
    tier = null;
  }
  const latePenalty = tier;

  // Ordnungsdienst: nicht erledigte Aufgaben aus einer vergangenen Periode als
  // verpasst melden – NACH der Antwort (after), damit das Einstempeln sofort
  // zurückkehrt. Best-effort, eigener Service-Client in den Helfern.
  after(async () => {
    if (latePenalty) {
      try {
        await awardLatePenalty({
          orgId: parsed.data.orgId,
          userId: user.id,
          sessionId,
          tier: latePenalty,
        });
      } catch {
        /* XP-Abzug ist best-effort – blockiert das Einstempeln nie */
      }
    }
    try {
      await flagMissedChoresOnClockIn(parsed.data.orgId, user.id);
    } catch {
      /* optional */
    }
    try {
      await flagMissedBinTasksOnClockIn(user.id);
    } catch {
      /* optional */
    }
  });

  revalidatePath('/app/time');
  return successResult(
    latePenalty
      ? `Eingestempelt. ${lateNoticeText(latePenalty, clockInIso)}`
      : 'Eingestempelt.',
  );
}

/** True when the user has an approved absence covering today (Berlin). */
async function hasApprovedAbsenceToday(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<boolean> {
  const today = berlinToday();
  const { data } = await supabase
    .from('absences')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * Books the late-clock-in XP penalty into the ledger and notifies the employee.
 * Idempotent per day via ref_id = the day's first work session (the existing
 * xp_events (user_id, kind, ref_id) unique index tolerates the retry conflict).
 * The penalty is a raw negative value – the XP boost factor is deliberately NOT
 * applied so a boost event can never soften (or inflate) a penalty.
 */
async function awardLatePenalty(params: {
  orgId: string;
  userId: string;
  sessionId: string;
  tier: LateTier;
}): Promise<void> {
  const { orgId, userId, sessionId, tier } = params;
  const service = createSupabaseServiceClient();

  const { error } = await service.from('xp_events').insert({
    user_id: userId,
    organization_id: orgId,
    kind: 'late',
    points: LATE_XP[tier],
    task_id: null,
    ref_id: sessionId,
  } as never);
  // 23505 = bereits gebucht (idempotent) → still ignorieren.
  if (error && error.code !== '23505') {
    logger.error('late penalty xp insert failed', { error });
    return;
  }
  // Bei bereits gebuchtem Event keine zweite Benachrichtigung erzeugen.
  if (error?.code === '23505') return;

  await createNotifications([
    {
      organizationId: orgId,
      recipientId: userId,
      type: 'late',
      title: `Verspätung – ${LATE_XP[tier]} XP`,
      body: `Du hast dich ${LATE_LABEL[tier]} eingestempelt. Dafür wurden dir ${Math.abs(
        LATE_XP[tier],
      )} XP abgezogen.`,
      entityType: 'work_session',
      entityId: sessionId,
    },
  ]);
}

export async function clockOutAction(): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: open } = await supabase
    .from('work_sessions')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .is('clock_out', null)
    .maybeSingle();
  if (!open) return errorResult('Keine laufende Arbeitszeitsitzung.');

  const now = new Date().toISOString();
  // Close any open break first.
  await supabase
    .from('work_session_breaks')
    .update({ break_end: now })
    .eq('work_session_id', open.id)
    .is('break_end', null);

  const { error } = await supabase
    .from('work_sessions')
    .update({ clock_out: now, status: 'closed' })
    .eq('id', open.id);
  if (error) return errorResult(de.errors.INTERNAL);

  // Reward a proper (self) clock-out: once today's NET working time from
  // non-auto-closed sessions qualifies, award the daily work XP + streak. NACH
  // der Antwort (after) mit eigenem Service-Client – blockiert das Ausstempeln
  // nicht mehr. Best-effort.
  after(async () => {
    try {
      await awardWorkdayIfQualified(
        createSupabaseServiceClient(),
        user.id,
        open.organization_id,
      );
    } catch {
      /* XP is a bonus, not part of the core action */
    }
  });

  // Ordnungsdienst: fällige Aufgaben (persönlich + geteilt) für diesen Ausstempel
  // zuteilen. Best-effort – blockiert das Ausstempeln nie.
  try {
    await assignClockOutChores({
      orgId: open.organization_id,
      userId: user.id,
      workSessionId: open.id,
    });
  } catch {
    /* chore assignment is optional */
  }

  // Mülltonnenservice: eine fällige Tonnen-Aufgabe fair zuteilen (best-effort).
  try {
    await assignClockOutBinTask({
      orgId: open.organization_id,
      userId: user.id,
      workSessionId: open.id,
    });
  } catch {
    /* bin assignment is optional */
  }

  revalidatePath('/app/time');
  return successResult('Ausgestempelt.');
}

/**
 * Sums today's NET working minutes across the user's non-auto-closed sessions
 * and, once the workday threshold is reached, grants the work-time XP + streak.
 */
async function awardWorkdayIfQualified(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
  orgId: string,
): Promise<void> {
  const dayStart = startOfBerlinDayUtc();
  const { data: todays } = await supabase
    .from('work_sessions')
    .select('id, clock_in, clock_out')
    .eq('user_id', userId)
    .eq('auto_closed', false)
    .gte('clock_in', dayStart);
  const ids = (todays ?? []).map((s) => s.id);
  if (ids.length === 0) return;

  const breakMin = new Map<string, number>();
  const { data: breaks } = await supabase
    .from('work_session_breaks')
    .select('work_session_id, break_start, break_end')
    .in('work_session_id', ids);
  const nowIso = new Date().toISOString();
  for (const b of breaks ?? []) {
    const mins = Math.max(
      0,
      (Date.parse(b.break_end ?? nowIso) - Date.parse(b.break_start)) / 60_000,
    );
    breakMin.set(
      b.work_session_id,
      (breakMin.get(b.work_session_id) ?? 0) + mins,
    );
  }

  let net = 0;
  for (const s of todays ?? []) {
    const end = s.clock_out ?? nowIso;
    net += Math.max(
      0,
      (Date.parse(end) - Date.parse(s.clock_in)) / 60_000 -
        (breakMin.get(s.id) ?? 0),
    );
  }

  if (net >= WORKDAY_MIN_NET_MINUTES) {
    await awardWorkdayXp(supabase, {
      userId,
      orgId,
      dayIso: berlinToday(),
    });
  }
}

export async function startBreakAction(): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: open } = await supabase
    .from('work_sessions')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .is('clock_out', null)
    .maybeSingle();
  if (!open) return errorResult('Keine laufende Arbeitszeitsitzung.');

  const { error } = await supabase.from('work_session_breaks').insert({
    work_session_id: open.id,
    organization_id: open.organization_id,
    break_start: new Date().toISOString(),
  });
  if (error) return errorResult('Es läuft bereits eine Pause.');

  await supabase
    .from('work_sessions')
    .update({ status: 'on_break' })
    .eq('id', open.id);

  // Collectible badge "Arbeitslos": count breaks taken.
  await bumpCounter('break');

  revalidatePath('/app/time');
  return successResult('Pause gestartet.');
}

export async function endBreakAction(): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: open } = await supabase
    .from('work_sessions')
    .select('id')
    .eq('user_id', user.id)
    .is('clock_out', null)
    .maybeSingle();
  if (!open) return errorResult('Keine laufende Arbeitszeitsitzung.');

  const { error } = await supabase
    .from('work_session_breaks')
    .update({ break_end: new Date().toISOString() })
    .eq('work_session_id', open.id)
    .is('break_end', null);
  if (error) return errorResult(de.errors.INTERNAL);

  await supabase
    .from('work_sessions')
    .update({ status: 'active' })
    .eq('id', open.id);

  revalidatePath('/app/time');
  return successResult('Pause beendet.');
}
