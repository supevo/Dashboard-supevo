'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const revalidateTask = (projectId: string, taskId: string) =>
  revalidatePath(`/app/projects/${projectId}/tasks/${taskId}`);

const createChecklistSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  title: z.string().min(1, 'Bitte gib einen Titel ein.').max(160),
});

export async function createChecklistAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createChecklistSchema.safeParse({
    orgId: formData.get('orgId'),
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    title: formData.get('title'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('checklists').insert({
    organization_id: parsed.data.orgId,
    task_id: parsed.data.taskId,
    title: parsed.data.title,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidateTask(parsed.data.projectId, parsed.data.taskId);
  return successResult('Checkliste erstellt.');
}

const addItemSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  checklistId: z.string().uuid(),
  content: z.string().min(1, 'Bitte gib einen Inhalt ein.').max(500),
});

export async function addChecklistItemAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = addItemSchema.safeParse({
    orgId: formData.get('orgId'),
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    checklistId: formData.get('checklistId'),
    content: formData.get('content'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('checklist_items').insert({
    organization_id: parsed.data.orgId,
    checklist_id: parsed.data.checklistId,
    content: parsed.data.content,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidateTask(parsed.data.projectId, parsed.data.taskId);
  return successResult();
}

const toggleItemSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  itemId: z.string().uuid(),
  isDone: z.enum(['true', 'false']),
});

export async function toggleChecklistItemAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = toggleItemSchema.safeParse({
    projectId: formData.get('projectId'),
    taskId: formData.get('taskId'),
    itemId: formData.get('itemId'),
    isDone: formData.get('isDone'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const done = parsed.data.isDone === 'true';
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('checklist_items')
    .update(
      {
        is_done: done,
        done_by: done ? user.id : null,
        done_at: done ? new Date().toISOString() : null,
      },
      { count: 'exact' },
    )
    .eq('id', parsed.data.itemId);

  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  revalidateTask(parsed.data.projectId, parsed.data.taskId);
  return successResult();
}
