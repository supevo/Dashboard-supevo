'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { bumpCounter } from '@/features/gamification/actions';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const orgSchema = z.object({ orgId: z.string().uuid() });

export async function clockInAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = orgSchema.safeParse({ orgId: formData.get('orgId') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('work_sessions').insert({
    organization_id: parsed.data.orgId,
    user_id: user.id,
    clock_in: new Date().toISOString(),
    status: 'active',
  });
  // Unique partial index rejects a second open session.
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
