'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { createNotifications } from '@/features/notifications/create';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const schema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function assignTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    userId: formData.get('userId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, taskId, userId } = parsed.data;

  const actor = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: task } = await supabase
    .from('tasks')
    .select('organization_id, title')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return errorResult(de.errors.NOT_FOUND);

  const { error } = await supabase.from('task_assignees').insert({
    task_id: taskId,
    user_id: userId,
    organization_id: task.organization_id,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  await createNotifications(
    [
      {
        organizationId: task.organization_id,
        recipientId: userId,
        type: 'task_assigned',
        title: 'Ihnen wurde eine Aufgabe zugewiesen',
        body: task.title,
        entityType: 'task',
        entityId: taskId,
      },
    ],
    actor.id,
  );

  await logActivity({
    actorId: actor.id,
    organizationId: task.organization_id,
    action: 'assignee_change',
    entityType: 'task',
    entityId: taskId,
    metadata: { assigned: userId },
  });

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  return successResult('Verantwortlicher hinzugefügt.');
}

export async function unassignTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    userId: formData.get('userId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, taskId, userId } = parsed.data;

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('task_assignees')
    .delete()
    .eq('task_id', taskId)
    .eq('user_id', userId);
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  return successResult('Verantwortlicher entfernt.');
}
