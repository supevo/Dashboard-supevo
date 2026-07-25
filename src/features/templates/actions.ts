'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import type { TemplateTask } from './queries';

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  is_internal: z.boolean().default(true),
});

const createSchema = z.object({
  name: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(120),
  tasks: z.array(taskSchema).min(1, 'Mindestens eine Aufgabe.').max(50),
});

/** Creates a project template (agency staff). Tasks come as JSON. */
export async function createTemplateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let tasksRaw: unknown;
  try {
    tasksRaw = JSON.parse(String(formData.get('tasks') ?? '[]'));
  } catch {
    return errorResult(de.errors.VALIDATION);
  }
  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    tasks: tasksRaw,
  });
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('project_templates').insert({
    organization_id: orgId,
    name: parsed.data.name,
    tasks: parsed.data.tasks as TemplateTask[],
    created_by: user.id,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/templates');
  return successResult('Vorlage gespeichert.');
}

/** Deletes a project template. */
export async function deleteTemplateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('project_templates')
    .delete()
    .eq('id', id.data);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/templates');
  return successResult('Gelöscht.');
}

const applySchema = z.object({
  projectId: z.string().uuid(),
  templateId: z.string().uuid(),
});

/** Seeds a template's tasks into a project's queue column (manager only). */
export async function applyTemplateAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = applySchema.safeParse({
    projectId: formData.get('projectId'),
    templateId: formData.get('templateId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, templateId } = parsed.data;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const [{ data: template }, { data: project }] = await Promise.all([
    supabase
      .from('project_templates')
      .select('tasks')
      .eq('id', templateId)
      .maybeSingle(),
    supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .maybeSingle(),
  ]);
  if (!template || !project) return errorResult(de.errors.FORBIDDEN);
  const tasks = (template.tasks ?? []) as TemplateTask[];
  if (tasks.length === 0) return errorResult('Vorlage enthält keine Aufgaben.');

  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!board) return errorResult(de.errors.INTERNAL);
  const { data: columns } = await supabase
    .from('board_columns')
    .select('id, column_key, position')
    .eq('board_id', board.id)
    .order('position', { ascending: true });
  const target =
    (columns ?? []).find((c) => c.column_key === 'queue') ?? (columns ?? [])[0];
  if (!target) return errorResult(de.errors.INTERNAL);

  const { data: maxRow } = await supabase
    .from('tasks')
    .select('position')
    .eq('column_id', target.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = (maxRow?.position ?? 0) + 1000;

  const rows = tasks.map((t) => ({
    organization_id: project.organization_id,
    project_id: projectId,
    board_id: board.id,
    column_id: target.id,
    title: t.title,
    description: t.description || null,
    priority: t.priority,
    is_internal: t.is_internal,
    created_by: user.id,
    position: (position += 1000),
  }));
  const { error } = await supabase.from('tasks').insert(rows);
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/projects/${projectId}`);
  return successResult(`${rows.length} Aufgaben aus Vorlage angelegt.`);
}
