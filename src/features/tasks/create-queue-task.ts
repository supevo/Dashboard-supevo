import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { logActivity } from '@/lib/audit';

/**
 * Creates a client-visible task in a project's queue column (falling back to the
 * first column). Shared by the client task form and the ideas board's
 * "in die Warteschlange" action. Returns the new task id, or null on failure.
 * The caller must have verified the user may access the project.
 */
export async function createClientQueueTask(opts: {
  projectId: string;
  organizationId: string;
  title: string;
  description: string | null;
  createdBy: string;
}): Promise<string | null> {
  const service = createSupabaseServiceClient();

  const { data: board } = await service
    .from('boards')
    .select('id')
    .eq('project_id', opts.projectId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!board) return null;

  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key, position')
    .eq('board_id', board.id)
    .order('position', { ascending: true });
  const target =
    (columns ?? []).find((c) => c.column_key === 'queue') ?? (columns ?? [])[0];
  if (!target) return null;

  const { data: maxRow } = await service
    .from('tasks')
    .select('position')
    .eq('column_id', target.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? 0) + 1000;

  const { data: task, error } = await service
    .from('tasks')
    .insert({
      organization_id: opts.organizationId,
      project_id: opts.projectId,
      board_id: board.id,
      column_id: target.id,
      title: opts.title,
      description: opts.description,
      priority: 'medium',
      is_internal: false,
      created_by: opts.createdBy,
      position: nextPosition,
    })
    .select('id')
    .single();
  if (error || !task) return null;

  await logActivity({
    actorId: opts.createdBy,
    organizationId: opts.organizationId,
    action: 'create',
    entityType: 'task',
    entityId: task.id,
    metadata: { title: opts.title, source: 'client_idea' },
  });

  return task.id;
}
