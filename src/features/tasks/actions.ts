'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { createNotifications } from '@/features/notifications/create';
import { logActivity } from '@/lib/audit';
import { awardTaskXp } from '@/features/gamification/xp';
import { checkAndAwardAchievements } from '@/features/gamification/achievements';
import { autoEstimateTaskMinutes } from '@/features/estimate/generate';
import { detectPrintProduct } from '@/features/print-billing/detect';
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

/**
 * Client-side briefing edit: a client updates the briefing (description) of a
 * task they can see. Authorization goes through the caller's RLS-scoped client
 * (the task only resolves if it is non-internal and in their project); the
 * write then uses the service client (clients can't update tasks under RLS).
 * Stored as plain text and rendered escaped, so no HTML injection is possible.
 */
export async function updateClientTaskBriefingAction(input: {
  projectId: string;
  taskId: string;
  description: string;
}): Promise<ActionResult> {
  const parsed = updateBriefingSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, taskId, description } = parsed.data;

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
  const { error } = await service
    .from('tasks')
    .update({ description: description ? description : null })
    .eq('id', taskId);
  if (error) return errorResult(de.errors.INTERNAL);

  // Notify agency staff on the project that the client changed the briefing.
  const { data: members } = await service
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId);
  const recipients = (members ?? []).map((m) => m.user_id).filter((id) => id !== user.id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: task.organization_id,
        recipientId,
        type: 'client_comment' as const,
        title: 'Kunde hat das Briefing aktualisiert',
        body: (description || '').slice(0, 140),
        entityType: 'task',
        entityId: taskId,
      })),
      user.id,
    );
  }

  await logActivity({
    actorId: user.id,
    organizationId: task.organization_id,
    action: 'update',
    entityType: 'task',
    entityId: taskId,
    metadata: { field: 'briefing', byClient: true },
  });

  revalidatePath(`/portal/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  return successResult('Briefing gespeichert.');
}

const renameTaskSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  title: z.string().trim().min(2, 'Bitte gib einen Titel ein.').max(200),
});

/**
 * Renames a task. Any agency staff member OR a client who can see the task may
 * rename it. Access is gated by an RLS-scoped read (agency staff see their org's
 * tasks; clients see only client-visible tasks of their company); the write then
 * runs via the service client so it isn't blocked by the manager-only RLS.
 */
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

  // RLS read = the access gate: it only returns the task if the caller may see
  // it (agency staff, or a client for a client-visible task).
  const { data: task } = await supabase
    .from('tasks')
    .select('id, organization_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const { error } = await service.from('tasks').update({ title }).eq('id', taskId);
  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: task.organization_id,
    action: 'update',
    entityType: 'task',
    entityId: taskId,
    metadata: { field: 'title' },
  });

  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/app/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/portal/projects/${projectId}`);
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

  // KI schätzt den Aufwand direkt bei Erstellung (für XP / Zeitnah-Tracking).
  await autoEstimateTaskMinutes(task.id, title, description ? description : null);

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

  // KI schätzt den Aufwand direkt bei Erstellung (für XP / Zeitnah-Tracking).
  await autoEstimateTaskMinutes(task.id, title, description ? description : null);

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

  const user = await requireUser();
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

  await afterTaskMoved(supabase, user.id, taskId, targetColumnId);

  revalidatePath('/app/projects');
  return successResult('Aufgabe verschoben.');
}

type MoveSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Shared post-move bookkeeping used by both the drag-based move and the
 * status dropdown: records completion + awards XP/badges when the task lands in
 * a done column, then logs the status change to the activity feed.
 */
async function afterTaskMoved(
  supabase: MoveSupabase,
  userId: string,
  taskId: string,
  targetColumnId: string,
): Promise<void> {
  // Record who finished the task when it lands in a done column, so colleagues
  // can award kudos for it and the completer earns the points.
  const { data: targetColumn } = await supabase
    .from('board_columns')
    .select('is_done_column, name, organization_id')
    .eq('id', targetColumnId)
    .maybeSingle();
  if (targetColumn?.is_done_column) {
    const completedAt = new Date().toISOString();
    const { data: doneTask } = await supabase
      .from('tasks')
      // Fertig → kein Express-Status mehr (das Ticket war für die Bearbeitung,
      // nicht für die erledigte Aufgabe).
      .update({ completed_by: userId, completed_at: completedAt, is_express: false })
      .eq('id', taskId)
      .select('due_date')
      .maybeSingle();
    const orgId = targetColumn.organization_id;
    if (orgId) {
      // Automatic XP + milestone badges for finishing the task (idempotent).
      await awardTaskXp({
        userId,
        orgId,
        taskId,
        dueDate: doneTask?.due_date ?? null,
        completedAt,
      });
      await checkAndAwardAchievements(userId, orgId);
    }
    // If the client bills print products and this task is a print job, flag it
    // so the completer is asked to upload the supplier invoice (→ Ausgaben).
    await maybeFlagPrintBilling(supabase, userId, targetColumn.organization_id, taskId);
  }

  // Log the move for the task's internal activity feed.
  await logActivity({
    actorId: userId,
    organizationId: targetColumn?.organization_id ?? null,
    action: 'status_change',
    entityType: 'task',
    entityId: taskId,
    metadata: { column: targetColumn?.name ?? '' },
  });
}

/**
 * When a task is completed, flag it for print billing if the task's client bills
 * print products and the task looks like a physical print job. Idempotent: only
 * sets the flag when it is not already set, and never overrides a settled task.
 */
async function maybeFlagPrintBilling(
  supabase: MoveSupabase,
  userId: string,
  orgId: string | null,
  taskId: string,
): Promise<void> {
  const { data: task } = await supabase
    .from('tasks')
    .select('id, title, description, project_id, print_billing_status')
    .eq('id', taskId)
    .maybeSingle();
  if (!task || task.print_billing_status) return; // already required/settled/dismissed

  const { data: project } = await supabase
    .from('projects')
    .select('client_company_id')
    .eq('id', task.project_id)
    .maybeSingle();
  if (!project?.client_company_id) return;

  const { data: company } = await supabase
    .from('client_companies')
    .select('bill_print_products')
    .eq('id', project.client_company_id)
    .maybeSingle();
  if (!company?.bill_print_products) return;

  const isPrint = await detectPrintProduct(task.title, task.description);
  if (!isPrint) return;

  await supabase
    .from('tasks')
    .update({ print_billing_status: 'required' })
    .eq('id', taskId);

  // Nudge the person who finished it to upload the supplier invoice. No
  // excludeUserId here: the completer IS the intended recipient.
  if (orgId) {
    await createNotifications([
      {
        organizationId: orgId,
        recipientId: userId,
        type: 'print_billing' as const,
        title: '💶 Abrechnung: Druckprodukt',
        body: `Bitte lade die Dienstleister-Rechnung für „${task.title}" hoch.`,
        entityType: 'task',
        entityId: taskId,
      },
    ]);
  }
}

const setTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['queue', 'active', 'review', 'done']),
});

/**
 * Sets a task's status by moving it to the matching board column – used by the
 * status dropdown on the dashboard/KI-Übersicht so people can work straight
 * from the overview without opening the board.
 *
 * The lock version is read fresh here (not passed from a possibly stale page
 * load), and the target column is resolved from the task's own board, so the
 * caller only needs the task id and the desired status.
 */
export async function setTaskStatusAction(
  taskId: string,
  status: 'queue' | 'active' | 'review' | 'done',
): Promise<ActionResult> {
  const parsed = setTaskStatusSchema.safeParse({ taskId, status });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Load the task (RLS-scoped) with its current column + lock version.
  const { data: task } = await supabase
    .from('tasks')
    .select('id, board_id, column_id, lock_version')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return errorResult(de.errors.FORBIDDEN);

  // Resolve the target column from the task's own board columns.
  const { data: columns } = await supabase
    .from('board_columns')
    .select('id, column_key, is_done_column')
    .eq('board_id', task.board_id);
  const target =
    status === 'done'
      ? (columns ?? []).find((c) => c.is_done_column) ??
        (columns ?? []).find((c) => c.column_key === 'done')
      : (columns ?? []).find((c) => c.column_key === status);
  if (!target) return errorResult('Für diesen Status gibt es keine Spalte.');

  // Already there → nothing to do.
  if (task.column_id === target.id) return successResult('Status unverändert.');

  // Append at the end of the target column.
  const { data: last } = await supabase
    .from('tasks')
    .select('position')
    .eq('column_id', target.id)
    .is('deleted_at', null)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const newPosition = (last?.position ?? 0) + 1000;

  const { error } = await supabase.rpc('move_task', {
    p_task_id: taskId,
    p_target_column_id: target.id,
    p_new_position: newPosition,
    p_expected_lock_version: task.lock_version,
  });
  if (error) return errorResult(moveErrorMessage(error.message));

  await afterTaskMoved(supabase, user.id, taskId, target.id);

  revalidatePath('/app');
  revalidatePath('/app/projects');
  return successResult('Status aktualisiert.');
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
