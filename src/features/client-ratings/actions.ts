'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { createNotifications } from '@/features/notifications/create';
import { awardClientPraiseXp } from '@/features/gamification/xp';
import { de } from '@/lib/i18n/de';
import { type ActionResult, errorResult, successResult } from '@/lib/action-result';

const schema = z.object({
  taskId: z.string().uuid(),
  projectId: z.string().uuid(),
  stars: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional().or(z.literal('')),
});

/**
 * A client rates the execution of a client-visible task (1–5 stars + optional
 * comment). Authorization: the task is read through the caller's RLS-scoped
 * client, so it only resolves if the client may actually see it (non-internal,
 * their project). The rating is then written with the service client.
 */
export async function rateTaskExecutionAction(input: {
  taskId: string;
  projectId: string;
  stars: number;
  comment: string;
}): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { taskId, projectId, stars } = parsed.data;
  const comment = parsed.data.comment ?? '';

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // RLS gate: a client only sees non-internal tasks in their own projects.
  const { data: task } = await supabase
    .from('tasks')
    .select('id, organization_id, project_id, is_internal')
    .eq('id', taskId)
    .maybeSingle();
  if (!task || task.project_id !== projectId || task.is_internal) {
    return errorResult(de.errors.FORBIDDEN);
  }

  const service = createSupabaseServiceClient();
  const { data: project } = await service
    .from('projects')
    .select('client_company_id')
    .eq('id', task.project_id)
    .maybeSingle();

  const { error } = await service.from('client_task_ratings').upsert(
    {
      organization_id: task.organization_id,
      task_id: taskId,
      client_company_id: project?.client_company_id ?? null,
      rated_by: user.id,
      stars,
      comment: comment.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'task_id,rated_by' },
  );
  if (error) return errorResult(de.errors.INTERNAL);

  // Bonus XP for the person who finished the task when the client is happy (≥4★).
  await awardClientPraiseXp({ orgId: task.organization_id, taskId, stars });

  // Notify agency staff on the project about the client feedback.
  const { data: members } = await service
    .from('project_members')
    .select('user_id')
    .eq('project_id', task.project_id);
  const recipients = (members ?? []).map((m) => m.user_id).filter((id) => id !== user.id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: task.organization_id,
        recipientId,
        type: 'client_comment' as const,
        title: `Kundenbewertung: ${stars}★`,
        body: comment.trim().slice(0, 140) || `${stars} von 5 Sternen`,
        entityType: 'task',
        entityId: taskId,
      })),
      user.id,
    );
  }

  revalidatePath(`/portal/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/app/projects/${task.project_id}/tasks/${taskId}`);
  return successResult('Danke für Ihre Bewertung!');
}
