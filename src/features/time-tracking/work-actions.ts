'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { bumpCounter } from '@/features/gamification/actions';
import { startOfBerlinDayUtc } from '@/lib/time';
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
 * still open – blocking a new clock-in (unique open-session index). To recover,
 * we auto-close any session left open from a previous day, crediting at most a
 * normal workday so days of runtime are not counted. Employees/admins can adjust
 * via a manual entry if needed.
 */
const AUTO_CLOSE_CAP_MINUTES = 8 * 60;

async function autoCloseStaleSession(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<void> {
  const dayStart = startOfBerlinDayUtc();
  const { data: open } = await supabase
    .from('work_sessions')
    .select('id, clock_in')
    .eq('user_id', userId)
    .is('clock_out', null)
    .lt('clock_in', dayStart) // only sessions NOT started today
    .maybeSingle();
  if (!open) return;

  const cappedMs = Math.min(
    Date.now(),
    Date.parse(open.clock_in) + AUTO_CLOSE_CAP_MINUTES * 60_000,
  );
  const clockOut = new Date(cappedMs).toISOString();

  // Close any dangling break first, then the session.
  await supabase
    .from('work_session_breaks')
    .update({ break_end: clockOut })
    .eq('work_session_id', open.id)
    .is('break_end', null);
  await supabase
    .from('work_sessions')
    .update({ clock_out: clockOut, status: 'closed' })
    .eq('id', open.id);
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
  await autoCloseStaleSession(supabase, user.id);

  const { error } = await supabase.from('work_sessions').insert({
    organization_id: parsed.data.orgId,
    user_id: user.id,
    clock_in: new Date().toISOString(),
    status: 'active',
  });
  // Unique partial index rejects a second open session (genuine one from today).
  if (error) return errorResult('Es läuft bereits eine Arbeitszeitsitzung.');

  revalidatePath('/app/time');
  return successResult('Eingestempelt.');
}

export async function clockOutAction(): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: open } = await supabase
    .from('work_sessions')
    .select('id')
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

  revalidatePath('/app/time');
  return successResult('Ausgestempelt.');
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
