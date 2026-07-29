'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { createNotifications } from '@/features/notifications/create';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import { currentExpressPeriod } from './queries';

const redeemSchema = z.object({ taskId: z.string().uuid() });

/**
 * A client redeems one of their monthly Express-Tickets on a task. The task is
 * flagged `is_express` (pulses on the board so the team sees it jumps the
 * queue), a redemption row is recorded for the current month, and the project's
 * agency staff are notified. The caller must be a contact of the task's client
 * company and still have a ticket left this period.
 */
export async function redeemExpressTicketAction(
  taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = redeemSchema.safeParse({ taskId });
  if (!parsed.success) return { ok: false, error: de.errors.VALIDATION };

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // RLS returns the task only if it is client-visible to this caller.
  const { data: task } = await supabase
    .from('tasks')
    .select('id, project_id, organization_id, title, is_express')
    .eq('id', parsed.data.taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: de.errors.NOT_FOUND };
  if (task.is_express) {
    return { ok: false, error: 'Diese Aufgabe ist bereits Express.' };
  }

  const { data: project } = await supabase
    .from('projects')
    .select('client_company_id')
    .eq('id', task.project_id)
    .maybeSingle();
  if (!project) return { ok: false, error: de.errors.NOT_FOUND };

  // Verify the caller is a contact of this client company.
  const { data: contact } = await supabase
    .from('client_contacts')
    .select('client_company_id')
    .eq('client_company_id', project.client_company_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!contact) return { ok: false, error: de.errors.FORBIDDEN };

  const period = currentExpressPeriod();

  // Contingent check (per calendar month).
  const { data: company } = await supabase
    .from('client_companies')
    .select('express_tickets_per_month')
    .eq('id', project.client_company_id)
    .maybeSingle();
  const perMonth = company?.express_tickets_per_month ?? 0;
  const { count: used } = await supabase
    .from('express_ticket_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('client_company_id', project.client_company_id)
    .eq('period', period);
  if (perMonth - (used ?? 0) <= 0) {
    return {
      ok: false,
      error: 'Für diesen Monat sind keine Express-Tickets mehr verfügbar.',
    };
  }

  const service = createSupabaseServiceClient();
  const { error: insErr } = await service
    .from('express_ticket_redemptions')
    .insert({
      organization_id: task.organization_id,
      client_company_id: project.client_company_id,
      task_id: task.id,
      redeemed_by: user.id,
      period,
    });
  if (insErr) return { ok: false, error: de.errors.INTERNAL };

  const { error: updErr } = await service
    .from('tasks')
    .update({ is_express: true })
    .eq('id', task.id);
  if (updErr) return { ok: false, error: de.errors.INTERNAL };

  await logActivity({
    actorId: user.id,
    organizationId: task.organization_id,
    action: 'update',
    entityType: 'task',
    entityId: task.id,
    metadata: { express: true, period },
  });

  // Notify agency staff on the project.
  const { data: members } = await service
    .from('project_members')
    .select('user_id')
    .eq('project_id', task.project_id);
  const recipients = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => id !== user.id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: task.organization_id,
        recipientId,
        type: 'express_redeemed' as const,
        title: '🚀 Express-Ticket eingelöst',
        body: `Der Kunde hat „${task.title}“ zur Express-Aufgabe gemacht – bitte vorziehen.`,
        entityType: 'task',
        entityId: task.id,
      })),
      user.id,
    );
  }

  revalidatePath(`/portal/projects/${task.project_id}`);
  revalidatePath(`/app/projects/${task.project_id}`);
  return { ok: true };
}
