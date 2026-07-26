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
import { estimateTaskMinutes } from './generate';

async function saveEstimate(
  taskId: string,
  projectId: string,
  minutes: number | null,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('tasks')
    .update({ estimated_minutes: minutes }, { count: 'exact' })
    .eq('id', taskId);
  if (error) return errorResult(de.errors.FORBIDDEN);
  if (!count) return errorResult(de.errors.FORBIDDEN);
  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  return successResult('Aufwand aktualisiert.');
}

/** KI-estimates the effort for a task and stores it. */
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
    .select('title, description')
    .eq('id', parsed.data.taskId)
    .maybeSingle();
  if (!task) return errorResult(de.errors.NOT_FOUND);

  const minutes = await estimateTaskMinutes(task.title, task.description);
  if (minutes === null) return errorResult(de.errors.INTERNAL);
  return saveEstimate(parsed.data.taskId, parsed.data.projectId, minutes);
}

/** Manually sets the effort estimate (in minutes). 0/empty clears it. */
export async function setEstimateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      taskId: z.string().uuid(),
      projectId: z.string().uuid(),
      minutes: z.coerce.number().int().min(0).max(4800),
    })
    .safeParse({
      taskId: formData.get('taskId'),
      projectId: formData.get('projectId'),
      minutes: formData.get('minutes') || 0,
    });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  return saveEstimate(
    parsed.data.taskId,
    parsed.data.projectId,
    parsed.data.minutes > 0 ? parsed.data.minutes : null,
  );
}
