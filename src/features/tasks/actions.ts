'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { archiveTaskSchema, createTaskSchema, moveTaskSchema } from './schema';

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

const updateBriefingSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  description: z.string().max(20000).optional().or(z.literal('')),
});

/** Updates a task's briefing (description). Stored as plain text and always
 *  rendered escaped, so no HTML injection is possible. */
export async function updateTaskBriefingAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateBriefingSchema.safeParse({
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, taskId, description } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('tasks')
    .update({ description: description ? description : null }, { count: 'exact' })
    .eq('id', taskId);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: null,
    action: 'update',
    entityType: 'task',
    entityId: taskId,
    metadata: { field: 'briefing' },
  });

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  return successResult('Briefing gespeichert.');
}

const updateDueDateSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
});

/** Sets or clears a task's due date. RLS (can_manage_project) is the guard. */
export async function updateTaskDueDateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateDueDateSchema.safeParse({
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    dueDate: formData.get('dueDate') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, taskId, dueDate } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('tasks')
    .update({ due_date: dueDate ? dueDate : null }, { count: 'exact' })
    .eq('id', taskId);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: null,
    action: 'update',
    entityType: 'task',
    entityId: taskId,
    metadata: { field: 'due_date', dueDate: dueDate || null },
  });

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/app/projects/${projectId}`);
  return successResult('Fälligkeitsdatum gespeichert.');
}

const updateVisibilitySchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  isInternal: z.union([z.literal('true'), z.literal('false')]),
});

/** Toggles whether a task is internal (agency-only) or visible to the client.
 *  RLS (can_manage_project) is the guard. */
export async function updateTaskVisibilityAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateVisibilitySchema.safeParse({
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    isInternal: formData.get('isInternal'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, taskId, isInternal } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('tasks')
    .update({ is_internal: isInternal === 'true' }, { count: 'exact' })
    .eq('id', taskId);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: null,
    action: 'update',
    entityType: 'task',
    entityId: taskId,
    metadata: { field: 'is_internal', isInternal: isInternal === 'true' },
  });

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/app/projects/${projectId}`);
  return successResult('Sichtbarkeit gespeichert.');
}

/** Maps a move_task() database exception to a user-facing German message. */
function moveErrorMessage(dbMessage: string): string {
  if (dbMessage.includes('WIP_LIMIT_TOTAL')) return de.kanban.wipLimitTotal;
  if (dbMessage.includes('WIP_LIMIT_USER')) return de.kanban.wipLimitUser;
  if (dbMessage.includes('LOCK_CONFLICT')) return de.kanban.lockConflict;
  if (dbMessage.includes('FORBIDDEN')) return de.errors.FORBIDDEN;
  if (dbMessage.includes('INVALID_COLUMN')) return de.kanban.invalidColumn;
  if (dbMessage.includes('TASK_NOT_FOUND')) return de.errors.NOT_FOUND;
  return de.errors.INTERNAL;
}

export async function createTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createTaskSchema.safeParse({
    projectId: formData.get('projectId'),
    columnId: formData.get('columnId'),
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    priority: formData.get('priority') ?? 'medium',
    isInternal: formData.get('isInternal') ?? 'true',
    dueDate: formData.get('dueDate') ?? '',
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const { projectId, columnId, title, description, priority, isInternal, dueDate } =
    parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Resolve org + board from the target column (RLS still guards the insert).
  const { data: column } = await supabase
    .from('board_columns')
    .select('id, board_id, organization_id')
    .eq('id', columnId)
    .maybeSingle();
  if (!column) return errorResult(de.errors.NOT_FOUND);

  const { data: maxRow } = await supabase
    .from('tasks')
    .select('position')
    .eq('column_id', columnId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? 0) + 1000;

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      organization_id: column.organization_id,
      project_id: projectId,
      board_id: column.board_id,
      column_id: columnId,
      title,
      description: description ? description : null,
      priority,
      is_internal: isInternal === 'true',
      due_date: dueDate ? dueDate : null,
      created_by: user.id,
      position: nextPosition,
    })
    .select('id')
    .single();

  if (error || !task) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: column.organization_id,
    action: 'create',
    entityType: 'task',
    entityId: task.id,
    metadata: { title },
  });

  revalidatePath(`/app/projects/${projectId}`);
  return successResult('Aufgabe erstellt.');
}

/** Moves a task to another column. WIP limits and optimistic locking are
 *  enforced atomically inside the move_task() database function. */
export async function moveTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = moveTaskSchema.safeParse({
    taskId: formData.get('taskId'),
    targetColumnId: formData.get('targetColumnId'),
    newPosition: formData.get('newPosition'),
    expectedLockVersion: formData.get('expectedLockVersion'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { taskId, targetColumnId, newPosition, expectedLockVersion } =
    parsed.data;

  await requireUser();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc('move_task', {
    p_task_id: taskId,
    p_target_column_id: targetColumnId,
    p_new_position: newPosition,
    p_expected_lock_version: expectedLockVersion,
  });

  if (error) {
    return errorResult(moveErrorMessage(error.message));
  }

  revalidatePath('/app/projects');
  return successResult('Aufgabe verschoben.');
}

const setArchivedSchema = z.object({
  taskId: z.string().uuid(),
  projectId: z.string().uuid(),
  archived: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true'),
});

export async function archiveTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setArchivedSchema.safeParse({
    taskId: formData.get('taskId'),
    projectId: formData.get('projectId'),
    archived: formData.get('archived') ?? 'true',
  });
  if (!parsed.success) {
    // Backwards-compatible path: taskId only → archive.
    const legacy = archiveTaskSchema.safeParse({
      taskId: formData.get('taskId'),
    });
    if (!legacy.success) return errorResult(de.errors.VALIDATION);
    return setArchived(legacy.data.taskId, null, true);
  }
  return setArchived(parsed.data.taskId, parsed.data.projectId, parsed.data.archived);
}

async function setArchived(
  taskId: string,
  projectId: string | null,
  archived: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('tasks')
    .update({ is_archived: archived }, { count: 'exact' })
    .eq('id', taskId);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: null,
    action: 'archive',
    entityType: 'task',
    entityId: taskId,
    metadata: { archived },
  });

  if (projectId) {
    revalidatePath(`/app/projects/${projectId}`);
    revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  }
  return successResult(
    archived ? 'Aufgabe archiviert.' : 'Aufgabe wiederhergestellt.',
  );
}
