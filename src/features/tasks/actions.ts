'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { createNotifications } from '@/features/notifications/create';
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

const renameTaskSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  title: z.string().trim().min(2, 'Bitte gib einen Titel ein.').max(200),
});

/** Renames a task. RLS (can_manage_project) is the guard. */
export async function renameTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = renameTaskSchema.safeParse({
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    title: formData.get('title'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, taskId, title } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('tasks')
    .update({ title }, { count: 'exact' })
    .eq('id', taskId);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  await logActivity({
    actorId: user.id,
    organizationId: null,
    action: 'update',
    entityType: 'task',
    entityId: taskId,
    metadata: { field: 'title' },
  });

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/app/projects/${projectId}`);
  return successResult('Aufgabe umbenannt.');
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

const createClientTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1, 'Bitte gib einen Titel ein.').max(200),
  description: z.string().max(20000).optional().or(z.literal('')),
});

/**
 * Lets a client (portal) add a task to a project they can access. Kept separate
 * from createTaskAction: the client form only has title + briefing, the task is
 * always client-visible (is_internal = false), and it is created via the service
 * client because RLS reserves task inserts for agency staff. Access is verified
 * in-code first (the RLS-scoped read only returns projects the user may see).
 */
export async function createClientTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createClientTaskSchema.safeParse({
    projectId: formData.get('projectId'),
    title: formData.get('title'),
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const { projectId, title, description } = parsed.data;

  const user = await requireUser();

  // Access check via RLS: the user must be able to see the project.
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from('projects')
    .select('id, organization_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();

  const { data: board } = await service
    .from('boards')
    .select('id')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!board) return errorResult(de.errors.INTERNAL);

  const { data: columns } = await service
    .from('board_columns')
    .select('id, column_key, position')
    .eq('board_id', board.id)
    .order('position', { ascending: true });
  // Prefer the "queue" column; fall back to the first column.
  const target =
    (columns ?? []).find((c) => c.column_key === 'queue') ?? (columns ?? [])[0];
  if (!target) return errorResult(de.errors.INTERNAL);

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
      organization_id: project.organization_id,
      project_id: projectId,
      board_id: board.id,
      column_id: target.id,
      title,
      description: description ? description : null,
      priority: 'medium',
      is_internal: false,
      created_by: user.id,
      position: nextPosition,
    })
    .select('id')
    .single();
  if (error || !task) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: project.organization_id,
    action: 'create',
    entityType: 'task',
    entityId: task.id,
    metadata: { title, source: 'client' },
  });

  // Alert the agency staff on this project so client requests are not missed.
  const { data: members } = await service
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId);
  const recipients = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => id !== user.id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: project.organization_id,
        recipientId,
        type: 'client_comment' as const,
        title: 'Neue Aufgabe vom Kunden',
        body: title,
        entityType: 'task',
        entityId: task.id,
      })),
      user.id,
    );
  }

  revalidatePath(`/portal/projects/${projectId}`);
  revalidatePath(`/app/projects/${projectId}`);
  return successResult('Aufgabe hinzugefügt.', { taskId: task.id });
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
