'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const schema = z.object({
  taskId: z.string().uuid(),
  projectId: z.string().uuid(),
  stars: z.coerce.number().int().min(1).max(10),
});

/** Rates a task's result (1–10). Assignees cannot rate their own task. */
export async function rateTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    taskId: formData.get('taskId'),
    projectId: formData.get('projectId'),
    stars: formData.get('stars'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { taskId, projectId, stars } = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('organization_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return errorResult(de.errors.NOT_FOUND);

  // Anti-gaming: you cannot rate a task you are assigned to.
  const { data: assignee } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('task_id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (assignee) {
    return errorResult('Eigene Aufgaben können nicht bewertet werden.');
  }

  const { error } = await supabase.from('task_ratings').upsert(
    {
      organization_id: task.organization_id,
      task_id: taskId,
      rater_user_id: user.id,
      stars,
    },
    { onConflict: 'task_id,rater_user_id' },
  );
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  return successResult('Bewertung gespeichert.');
}
