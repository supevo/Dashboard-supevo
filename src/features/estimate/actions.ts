'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { isAiEnabled } from '@/lib/ai/complete';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { estimateTaskMinutes, fetchEstimateExamples } from './generate';

/**
 * KI-schätzt den Aufwand und speichert ihn als KI-Rohwert
 * (ai_estimate_minutes). Der effektiv genutzte Wert (estimated_minutes) bleibt
 * ein bestehender manueller Override – ansonsten übernimmt er die KI-Schätzung.
 */
export async function estimateTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ taskId: z.string().uuid(), projectId: z.string().uuid() })
    .safeParse({
      taskId: formData.get('taskId'),
      projectId: formData.get('projectId'),
    });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  if (!isAiEnabled()) return errorResult('KI ist nicht konfiguriert.');

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('title, description, organization_id, manual_estimate_minutes')
    .eq('id', parsed.data.taskId)
    .maybeSingle();
  if (!task) return errorResult(de.errors.NOT_FOUND);

  const examples = await fetchEstimateExamples(task.organization_id);
  const minutes = await estimateTaskMinutes(task.title, task.description, examples);
  if (minutes === null) return errorResult(de.errors.INTERNAL);

  // Manueller Override gewinnt weiterhin; sonst ist die KI-Schätzung effektiv.
  const effective = task.manual_estimate_minutes ?? minutes;
  const { error, count } = await supabase
    .from('tasks')
    .update(
      { ai_estimate_minutes: minutes, estimated_minutes: effective },
      { count: 'exact' },
    )
    .eq('id', parsed.data.taskId);
  if (error || !count) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/projects/${parsed.data.projectId}/tasks/${parsed.data.taskId}`);
  return successResult('KI-Schätzung aktualisiert.');
}

/**
 * Setzt die HÄNDISCHE Aufwandsschätzung (Minuten). Sie überschreibt die KI und
 * dient künftig als Lern-Beispiel. 0/leer entfernt den manuellen Wert – dann
 * greift wieder die KI-Schätzung.
 */
export async function setManualEstimateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      taskId: z.string().uuid(),
      projectId: z.string().uuid(),
      // Betrag in der gewählten Einheit (Minuten oder Stunden, Dezimal erlaubt).
      amount: z.coerce.number().min(0).max(4800),
      unit: z.enum(['min', 'h']).default('min'),
    })
    .safeParse({
      taskId: formData.get('taskId'),
      projectId: formData.get('projectId'),
      // Rückwärtskompatibel: altes Feld „minutes" weiter akzeptieren.
      amount: formData.get('amount') ?? formData.get('minutes') ?? 0,
      unit: formData.get('unit') ?? 'min',
    });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();

  const rawMinutes =
    parsed.data.unit === 'h' ? parsed.data.amount * 60 : parsed.data.amount;
  const minutes = Math.min(4800, Math.max(0, Math.round(rawMinutes)));
  const manual = minutes > 0 ? minutes : null;
  // Effektiver Wert = manuell ∨ (bestehende) KI-Schätzung.
  const { data: task } = await supabase
    .from('tasks')
    .select('ai_estimate_minutes')
    .eq('id', parsed.data.taskId)
    .maybeSingle();
  const effective = manual ?? task?.ai_estimate_minutes ?? null;

  const { error, count } = await supabase
    .from('tasks')
    .update(
      { manual_estimate_minutes: manual, estimated_minutes: effective },
      { count: 'exact' },
    )
    .eq('id', parsed.data.taskId);
  if (error || !count) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/projects/${parsed.data.projectId}/tasks/${parsed.data.taskId}`);
  return successResult('Aufwand aktualisiert.');
}
