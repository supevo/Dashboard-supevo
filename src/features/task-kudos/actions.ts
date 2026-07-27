'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { createNotifications } from '@/features/notifications/create';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const schema = z.object({
  taskId: z.string().uuid(),
  projectId: z.string().uuid(),
  points: z.coerce.number().int().refine((v) => [5, 10, 20].includes(v)),
});

/**
 * Awards kudos points to the person who completed a task (peer review of
 * finished work). One rating per rater per task. The recipient is notified —
 * anonymously, without revealing who awarded the points.
 */
export async function giveTaskKudosAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    taskId: formData.get('taskId'),
    projectId: formData.get('projectId'),
    points: formData.get('points'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { taskId, projectId, points } = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('organization_id, title, completed_by, completed_at')
    .eq('id', taskId)
    .maybeSingle();
  if (!task || !task.completed_at || !task.completed_by) {
    return errorResult('Diese Aufgabe ist noch nicht fertiggestellt.');
  }
  if (task.completed_by === user.id) {
    return errorResult('Du kannst deine eigene Aufgabe nicht bewerten.');
  }

  const { error } = await supabase.from('kudos').insert({
    organization_id: task.organization_id,
    from_user_id: user.id,
    to_user_id: task.completed_by,
    badge: 'task',
    points,
    task_id: taskId,
  });
  if (error) {
    if (error.code === '23505') {
      return errorResult('Du hast diese Aufgabe bereits bewertet.');
    }
    return errorResult(de.errors.FORBIDDEN);
  }

  // Anonymous notification to the completer — the giver is intentionally hidden.
  await createNotifications([
    {
      organizationId: task.organization_id,
      recipientId: task.completed_by,
      type: 'kudos' as const,
      title: '🎉 Du hast Punkte erhalten!',
      body: `Du hast +${points} Punkte für „${task.title}" erhalten.`,
      entityType: 'task',
      entityId: taskId,
    },
  ]);

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/app/projects/${projectId}`);
  return successResult('Punkte vergeben. Danke fürs Bewerten!');
}
