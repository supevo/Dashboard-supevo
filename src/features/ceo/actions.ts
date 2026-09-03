'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/authorize';
import { isSuperAdmin } from '@/lib/authz/policies';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { CEO_STATUSES } from './types';

/** Nur der/die Geschäftsführer:in (Super-Admin) nutzt das GF-Board. */
async function requireCeo() {
  const user = await requireUser();
  if (!isSuperAdmin(user)) return null;
  return user;
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(4000).optional().or(z.literal('')),
  status: z.enum(['backlog', 'today', 'doing', 'done']).default('backlog'),
  quadrant: z.coerce.number().int().min(1).max(4).optional().nullable(),
  energy: z.enum(['deep', 'shallow']).optional().nullable(),
  area: z.string().trim().max(60).optional().or(z.literal('')),
  estimateMin: z.coerce.number().int().min(0).max(24 * 60).optional().nullable(),
  dueDate: z.string().trim().max(20).optional().or(z.literal('')),
});

/** Legt eine neue GF-Karte an. */
export async function createCeoTaskAction(input: {
  title: string;
  notes?: string;
  status?: string;
  quadrant?: number | null;
  energy?: string | null;
  area?: string;
  estimateMin?: number | null;
  dueDate?: string;
}): Promise<ActionResult> {
  const user = await requireCeo();
  if (!user) return errorResult(de.errors.FORBIDDEN);
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return errorResult('Bitte einen Titel angeben.');
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('ceo_tasks').insert({
    user_id: user.id,
    organization_id: primaryAgencyOrgId(user) ?? null,
    title: d.title,
    notes: d.notes || null,
    status: d.status,
    quadrant: d.quadrant ?? null,
    energy: d.energy ?? null,
    area: d.area || null,
    estimate_min: d.estimateMin ?? null,
    due_date: d.dueDate || null,
    done_at: d.status === 'done' ? new Date().toISOString() : null,
  });
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/gf');
  return successResult('Karte angelegt.');
}

const idSchema = z.string().uuid();

const updateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  notes: z.string().trim().max(4000).optional().or(z.literal('')),
  quadrant: z.coerce.number().int().min(1).max(4).optional().nullable(),
  energy: z.enum(['deep', 'shallow']).optional().nullable(),
  area: z.string().trim().max(60).optional().or(z.literal('')),
  estimateMin: z.coerce.number().int().min(0).max(24 * 60).optional().nullable(),
  dueDate: z.string().trim().max(20).optional().or(z.literal('')),
});

/** Aktualisiert die Detailfelder einer Karte. */
export async function updateCeoTaskAction(
  taskId: string,
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult> {
  const user = await requireCeo();
  if (!user) return errorResult(de.errors.FORBIDDEN);
  if (!idSchema.safeParse(taskId).success) return errorResult(de.errors.VALIDATION);
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const d = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.title !== undefined) patch.title = d.title;
  if (d.notes !== undefined) patch.notes = d.notes || null;
  if (d.quadrant !== undefined) patch.quadrant = d.quadrant ?? null;
  if (d.energy !== undefined) patch.energy = d.energy ?? null;
  if (d.area !== undefined) patch.area = d.area || null;
  if (d.estimateMin !== undefined) patch.estimate_min = d.estimateMin ?? null;
  if (d.dueDate !== undefined) patch.due_date = d.dueDate || null;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('ceo_tasks')
    .update(patch as Record<string, never>)
    .eq('id', taskId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/gf');
  return successResult('Gespeichert.');
}

/** Verschiebt eine Karte in eine andere Spalte (Kanban-Status). */
export async function moveCeoTaskAction(
  taskId: string,
  status: string,
): Promise<ActionResult> {
  const user = await requireCeo();
  if (!user) return errorResult(de.errors.FORBIDDEN);
  if (!idSchema.safeParse(taskId).success) return errorResult(de.errors.VALIDATION);
  if (!CEO_STATUSES.includes(status as (typeof CEO_STATUSES)[number])) {
    return errorResult(de.errors.VALIDATION);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('ceo_tasks')
    .update({
      status,
      done_at: status === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/gf');
  return successResult();
}

/**
 * Verschiebt + sortiert eine Karte per Drag&Drop: setzt Spalte (Status) und die
 * numerische Position innerhalb der Spalte in einem Rutsch.
 */
export async function reorderCeoTaskAction(
  taskId: string,
  status: string,
  position: number,
): Promise<ActionResult> {
  const user = await requireCeo();
  if (!user) return errorResult(de.errors.FORBIDDEN);
  if (!idSchema.safeParse(taskId).success) return errorResult(de.errors.VALIDATION);
  if (!CEO_STATUSES.includes(status as (typeof CEO_STATUSES)[number])) {
    return errorResult(de.errors.VALIDATION);
  }
  if (!Number.isFinite(position)) return errorResult(de.errors.VALIDATION);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('ceo_tasks')
    .update({
      status,
      position,
      done_at: status === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/gf');
  return successResult();
}

/** Löscht eine Karte. */
export async function deleteCeoTaskAction(taskId: string): Promise<ActionResult> {
  const user = await requireCeo();
  if (!user) return errorResult(de.errors.FORBIDDEN);
  if (!idSchema.safeParse(taskId).success) return errorResult(de.errors.VALIDATION);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('ceo_tasks').delete().eq('id', taskId);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/gf');
  return successResult();
}
