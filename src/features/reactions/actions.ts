'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { createNotifications } from '@/features/notifications/create';
import { isReactionEmoji } from '@/features/reactions/shared';

type Result = { ok: true; emoji: string | null } | { ok: false; error: string };

/**
 * Sets (or clears, when emoji is null) the current user's reaction on a task.
 * IDOR-safe: the task is first read with the caller's RLS client, so a user can
 * only react to a task they are allowed to see. The write itself goes through
 * the service client (the table has no insert policy). On a new/changed
 * reaction the task's assignees are notified.
 */
export async function setTaskReactionAction(
  taskId: string,
  emoji: string | null,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Nicht angemeldet.' };
  if (emoji !== null && !isReactionEmoji(emoji)) {
    return { ok: false, error: 'Ungültige Reaktion.' };
  }

  // Access gate: RLS hides tasks the caller may not see → null means forbidden.
  const rls = await createSupabaseServerClient();
  const { data: task } = await rls
    .from('tasks')
    .select('id, title, organization_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: 'Aufgabe nicht gefunden.' };

  const service = createSupabaseServiceClient();

  if (emoji === null) {
    await service
      .from('task_reactions')
      .delete()
      .eq('task_id', taskId)
      .eq('user_id', user.id);
    return { ok: true, emoji: null };
  }

  await service.from('task_reactions').upsert(
    {
      task_id: taskId,
      user_id: user.id,
      organization_id: task.organization_id,
      emoji,
    },
    { onConflict: 'task_id,user_id' },
  );

  // Notify the task's assignees that the client reacted (skip the actor).
  const { data: assignees } = await service
    .from('task_assignees')
    .select('user_id')
    .eq('task_id', taskId);
  const recipientIds = [
    ...new Set((assignees ?? []).map((a) => a.user_id)),
  ].filter((id) => id !== user.id);
  if (recipientIds.length > 0) {
    await createNotifications(
      recipientIds.map((recipientId) => ({
        organizationId: task.organization_id,
        recipientId,
        type: 'reaction' as const,
        title: `${emoji} Reaktion vom Kunden`,
        body: `„${task.title}" wurde vom Kunden mit ${emoji} gewürdigt.`,
        entityType: 'task',
        entityId: taskId,
      })),
      user.id,
    );
  }

  return { ok: true, emoji };
}
