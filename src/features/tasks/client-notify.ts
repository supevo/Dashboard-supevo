'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { createNotifications } from '@/features/notifications/create';
import { awardClientUpdateXp } from '@/features/gamification/xp';

function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

interface TaskCtx {
  orgId: string;
  title: string;
  clientCompanyId: string;
  clientName: string;
  greeting: string;
  responsible: string;
  agencyName: string;
  recipientIds: string[];
  alreadyNotified: boolean;
}

/**
 * Resolves everything needed to notify the client that a task is done: the
 * client's contacts, a greeting name, the responsible person and the agency
 * name. Authorizes that the current user is agency staff of the task's org.
 */
async function resolveTaskCtx(taskId: string): Promise<TaskCtx | { error: string }> {
  if (!z.string().uuid().safeParse(taskId).success) return { error: 'Ungültige Aufgabe.' };
  const user = await requireUser();
  if (!hasAgencyAccess(user)) return { error: 'Keine Berechtigung.' };

  const service = createSupabaseServiceClient();
  const { data: task } = await service
    .from('tasks')
    .select('id, title, project_id, organization_id, completed_by, client_notified_at')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return { error: 'Aufgabe nicht gefunden.' };
  if (!user.memberships.some((m) => m.organizationId === task.organization_id)) {
    return { error: 'Keine Berechtigung.' };
  }

  const { data: project } = await service
    .from('projects')
    .select('client_company_id')
    .eq('id', task.project_id)
    .maybeSingle();
  const clientCompanyId = project?.client_company_id ?? null;
  if (!clientCompanyId) return { error: 'Diese Aufgabe hat keinen Kunden.' };

  const [{ data: company }, { data: contacts }, { data: org }, { data: completer }] =
    await Promise.all([
      service.from('client_companies').select('name').eq('id', clientCompanyId).maybeSingle(),
      service
        .from('client_contacts')
        .select('user_id, is_primary, notify_task_updates')
        .eq('client_company_id', clientCompanyId),
      service.from('organizations').select('name').eq('id', task.organization_id).maybeSingle(),
      task.completed_by
        ? service.from('profiles').select('full_name').eq('id', task.completed_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  // Only contacts who have opted in to per-task notifications (default: on).
  const recipientIds = [
    ...new Set(
      (contacts ?? [])
        .filter((c) => c.notify_task_updates !== false)
        .map((c) => c.user_id),
    ),
  ];

  // Greeting: the primary contact's first name, else the company name.
  let greeting = company?.name ?? 'Team';
  const primary = (contacts ?? []).find((c) => c.is_primary) ?? (contacts ?? [])[0];
  if (primary) {
    const { data: p } = await service
      .from('profiles')
      .select('full_name')
      .eq('id', primary.user_id)
      .maybeSingle();
    const fn = firstName(p?.full_name);
    if (fn) greeting = fn;
  }

  const responsible =
    completer?.full_name?.trim() || user.fullName || user.email || 'Ihr Ansprechpartner';

  return {
    orgId: task.organization_id,
    title: task.title,
    clientCompanyId,
    clientName: company?.name ?? 'Kunde',
    greeting,
    responsible,
    agencyName: org?.name ?? 'Ihr Team',
    recipientIds,
    alreadyNotified: Boolean(task.client_notified_at),
  };
}

/** Suggested (editable) message for the "task done" client update. */
export async function getClientNotifyDraft(
  taskId: string,
): Promise<
  | { ok: true; message: string; alreadyNotified: boolean; hasRecipients: boolean }
  | { ok: false; error: string }
> {
  const ctx = await resolveTaskCtx(taskId);
  if ('error' in ctx) return { ok: false, error: ctx.error };

  const message =
    `Hallo ${ctx.greeting},\n\n` +
    `wir haben die Aufgabe „${ctx.title}" für Sie erledigt ✅.\n\n` +
    `Bei Fragen oder Wünschen melden Sie sich gerne bei ${ctx.responsible}.\n\n` +
    `Beste Grüße\n${ctx.agencyName}`;

  return {
    ok: true,
    message,
    alreadyNotified: ctx.alreadyNotified,
    hasRecipients: ctx.recipientIds.length > 0,
  };
}

const sendSchema = z.object({
  taskId: z.string().uuid(),
  message: z.string().trim().min(5).max(2000),
});

/**
 * Sends the "task done" update to the client's contacts (portal notification +
 * email if configured), marks the task, and awards a small XP once per task.
 */
export async function notifyClientTaskDoneAction(
  taskId: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = sendSchema.safeParse({ taskId, message });
  if (!parsed.success) return { ok: false, error: 'Bitte eine Nachricht eingeben.' };

  const ctx = await resolveTaskCtx(taskId);
  if ('error' in ctx) return { ok: false, error: ctx.error };
  if (ctx.recipientIds.length === 0) {
    return { ok: false, error: 'Dieser Kunde hat keinen Ansprechpartner mit Zugang.' };
  }

  const user = await requireUser();
  const service = createSupabaseServiceClient();

  await createNotifications(
    ctx.recipientIds.map((recipientId) => ({
      organizationId: ctx.orgId,
      recipientId,
      type: 'task_done' as const,
      title: `Erledigt: ${ctx.title}`,
      body: parsed.data.message,
      entityType: 'task',
      entityId: taskId,
    })),
    user.id,
  );

  await service
    .from('tasks')
    .update({ client_notified_at: new Date().toISOString() })
    .eq('id', taskId);

  await awardClientUpdateXp({ userId: user.id, orgId: ctx.orgId, taskId });

  revalidatePath('/app/projects');
  return { ok: true };
}

/**
 * Zieht einen bereits gesendeten „Aufgabe erledigt"-Bericht zurück: löscht die
 * task_done-Benachrichtigungen des Kunden zu dieser Aufgabe und setzt die
 * Aufgabe wieder auf „nicht informiert". Für Fälle, in denen zu voreilig
 * abgesendet wurde. Nur für Agentur-Mitarbeiter der zugehörigen Org.
 */
export async function retractClientNotifyAction(
  taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolveTaskCtx(taskId);
  if ('error' in ctx) return { ok: false, error: ctx.error };

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('notifications')
    .delete()
    .eq('type', 'task_done')
    .eq('entity_id', taskId)
    .eq('organization_id', ctx.orgId);
  if (error) return { ok: false, error: 'Zurückziehen fehlgeschlagen.' };

  await service
    .from('tasks')
    .update({ client_notified_at: null })
    .eq('id', taskId);

  revalidatePath('/app/projects');
  revalidatePath('/portal/reports');
  return { ok: true };
}
