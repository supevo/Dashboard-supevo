'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

/**
 * „Aufgabe übernehmen": weist die (noch nicht zugewiesene) Aufgabe dem aktuellen
 * Nutzer zu. Idempotent – ist sie schon meine, passiert nichts Schlimmes.
 */
export async function claimTaskAction(input: {
  taskId: string;
}): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(input.taskId).success) {
    return errorResult(de.errors.VALIDATION);
  }
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('organization_id, project_id')
    .eq('id', input.taskId)
    .maybeSingle();
  if (!task) return errorResult(de.errors.NOT_FOUND);

  // Schon mir zugewiesen? Dann nichts tun (idempotent).
  const { data: existing } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('task_id', input.taskId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) return successResult('Bereits übernommen.');

  const { error } = await supabase.from('task_assignees').insert({
    task_id: input.taskId,
    user_id: user.id,
    organization_id: task.organization_id,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: task.organization_id,
    action: 'assignee_change',
    entityType: 'task',
    entityId: input.taskId,
    metadata: { assigned: user.id, self: true },
  });

  revalidatePath('/app');
  revalidatePath(`/app/projects/${task.project_id}/tasks/${input.taskId}`);
  return successResult('Aufgabe übernommen.');
}
