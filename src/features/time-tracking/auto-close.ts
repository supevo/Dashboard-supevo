import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { logger } from '@/lib/logger';

/**
 * A forgotten clock-out would otherwise keep a session open indefinitely. Once
 * the NET working time (gross minus breaks) reaches this threshold, the session
 * is closed automatically and only a normal workday is credited. Marked
 * `auto_closed` so it earns no work XP and breaks the work-time streak.
 */
export const AUTO_CLOSE_TRIGGER_NET_MINUTES = 11 * 60;
export const AUTO_CLOSE_CREDIT_MINUTES = 8 * 60;

interface OpenSession {
  id: string;
  organization_id: string;
  user_id: string;
  clock_in: string;
}

/** Sum of a session's break milliseconds up to `uptoMs` (open break → uptoMs). */
async function sumBreakMs(
  client: SupabaseClient,
  sessionId: string,
  uptoMs: number,
): Promise<number> {
  const { data } = await client
    .from('work_session_breaks')
    .select('break_start, break_end')
    .eq('work_session_id', sessionId);
  let ms = 0;
  for (const b of data ?? []) {
    const start = Date.parse(b.break_start);
    const end = b.break_end ? Date.parse(b.break_end) : uptoMs;
    ms += Math.max(0, Math.min(end, uptoMs) - start);
  }
  return ms;
}

/**
 * Closes one forgotten session: credits 8 h NET (gross span = 8 h + the breaks
 * that fall inside it), closes any dangling break, marks it `auto_closed`, and
 * notifies the employee. Works with any client (service in the cron, the user's
 * own client in the clock-in recovery). Best-effort notification.
 */
export async function autoCloseSession(
  client: SupabaseClient,
  s: OpenSession,
): Promise<void> {
  const nowMs = Date.now();
  const breakMs = await sumBreakMs(client, s.id, nowMs);
  const targetMs =
    Date.parse(s.clock_in) + AUTO_CLOSE_CREDIT_MINUTES * 60_000 + breakMs;
  const clockOut = new Date(Math.min(targetMs, nowMs)).toISOString();

  await client
    .from('work_session_breaks')
    .update({ break_end: clockOut })
    .eq('work_session_id', s.id)
    .is('break_end', null);
  await client
    .from('work_sessions')
    .update({ clock_out: clockOut, status: 'closed', auto_closed: true })
    .eq('id', s.id);

  await createNotifications([
    {
      organizationId: s.organization_id,
      recipientId: s.user_id,
      type: 'absence',
      title: '⏰ Automatisch ausgestempelt',
      body:
        'Du hast vergessen auszustempeln. Dir wurden 8 Std. angerechnet. Für ' +
        'diese Arbeitszeit gibt es keine Arbeitszeit-XP und der Arbeitszeit-' +
        'Streak wird dadurch unterbrochen. Bitte denk daran, dich selbst ' +
        'auszustempeln.',
      entityType: 'work_session',
      entityId: s.id,
    },
  ]);
}

/**
 * Cron entry point: finds every session whose NET working time has passed the
 * threshold and closes it. Uses the service client so it spans all orgs and
 * bypasses RLS. Only sessions clocked in more than the threshold ago can even
 * qualify, so we pre-filter on that to keep the scan small.
 */
export async function runAutoClockout(): Promise<{ closed: number }> {
  const service = createSupabaseServiceClient();
  const cutoffIso = new Date(
    Date.now() - AUTO_CLOSE_TRIGGER_NET_MINUTES * 60_000,
  ).toISOString();

  const { data: open } = await service
    .from('work_sessions')
    .select('id, organization_id, user_id, clock_in')
    .is('clock_out', null)
    .lt('clock_in', cutoffIso);

  let closed = 0;
  for (const s of open ?? []) {
    const nowMs = Date.now();
    const breakMs = await sumBreakMs(service, s.id, nowMs);
    const netMs = nowMs - Date.parse(s.clock_in) - breakMs;
    if (netMs < AUTO_CLOSE_TRIGGER_NET_MINUTES * 60_000) continue;
    try {
      await autoCloseSession(service, s as OpenSession);
      closed += 1;
    } catch (e) {
      logger.warn('auto_clockout.close_failed', {
        sessionId: s.id,
        error: (e as Error).message,
      });
    }
  }
  return { closed };
}
