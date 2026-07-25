'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { berlinToday } from '@/lib/time';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { nextRunAfter } from './recurrence';

const createSchema = z
  .object({
    projectId: z.string().uuid(),
    title: z.string().trim().min(1, 'Bitte gib einen Titel ein.').max(200),
    description: z.string().max(20000).optional().or(z.literal('')),
    frequency: z.enum(['weekly', 'monthly']),
    weekday: z.coerce.number().int().min(0).max(6).optional(),
    dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
    isInternal: z.enum(['true', 'false']).default('true'),
  })
  .refine(
    (d) =>
      d.frequency === 'weekly'
        ? d.weekday !== undefined
        : d.dayOfMonth !== undefined,
    { message: 'Bitte Wochentag bzw. Tag im Monat wählen.' },
  );

/** Creates a recurring task template for a project (manager only via RLS). */
export async function createRecurringTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    projectId: formData.get('projectId'),
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    frequency: formData.get('frequency'),
    weekday: formData.get('weekday') ?? undefined,
    dayOfMonth: formData.get('dayOfMonth') ?? undefined,
    isInternal: formData.get('isInternal') ?? 'true',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { projectId, title, description, frequency, isInternal } = parsed.data;
  const weekday = frequency === 'weekly' ? (parsed.data.weekday ?? 1) : null;
  const dayOfMonth =
    frequency === 'monthly' ? (parsed.data.dayOfMonth ?? 1) : null;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Resolve org + target column (the project's queue) — RLS-scoped reads.
  const { data: project } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return errorResult(de.errors.FORBIDDEN);

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

  const nextRun = nextRunAfter(frequency, weekday, dayOfMonth, berlinToday());

  const { error } = await supabase.from('recurring_tasks').insert({
    organization_id: project.organization_id,
    project_id: projectId,
    column_id: target.id,
    title,
    description: description ? description : null,
    priority: 'medium',
    is_internal: isInternal === 'true',
    frequency,
    weekday,
    day_of_month: dayOfMonth,
    next_run_date: nextRun,
    created_by: user.id,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/projects/${projectId}`);
  return successResult('Wiederkehrende Aufgabe angelegt.');
}

const idSchema = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid(),
});

/** Toggles a template active/paused. */
export async function toggleRecurringTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      projectId: z.string().uuid(),
      id: z.string().uuid(),
      active: z.enum(['true', 'false']),
    })
    .safeParse({
      projectId: formData.get('projectId'),
      id: formData.get('id'),
      active: formData.get('active'),
    });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('recurring_tasks')
    .update({ active: parsed.data.active === 'true' }, { count: 'exact' })
    .eq('id', parsed.data.id);
  if (error) return errorResult(de.errors.INTERNAL);
  if (!count) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  return successResult('Aktualisiert.');
}

/** Deletes a recurring task template. */
export async function deleteRecurringTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({
    projectId: formData.get('projectId'),
    id: formData.get('id'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('recurring_tasks')
    .delete()
    .eq('id', parsed.data.id);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  return successResult('Gelöscht.');
}
