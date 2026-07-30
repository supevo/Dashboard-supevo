'use server';

import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { primaryAgencyOrgId } from '@/features/auth/session';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { createNotifications } from '@/features/notifications/create';
import { revalidatePath } from 'next/cache';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const submitSchema = z.object({
  kind: z.enum(['bug', 'idea', 'wish']),
  title: z.string().trim().min(3).max(140),
  message: z.string().trim().max(4000).optional().or(z.literal('')),
});

/**
 * Submits feedback (bug / idea / wish) from an agency employee OR a client. The
 * org + author role are resolved server-side; the row is written via the service
 * client (clients have no agency-org membership under RLS). Notifies org admins.
 */
export async function submitFeedbackAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = submitSchema.safeParse({
    kind: formData.get('kind'),
    title: formData.get('title'),
    message: formData.get('message') ?? '',
  });
  if (!parsed.success) return errorResult('Bitte Titel (min. 3 Zeichen) angeben.');

  const user = await requireUser();
  const isAgency = hasAgencyAccess(user);

  let orgId: string | null = null;
  if (isAgency) {
    orgId = primaryAgencyOrgId(user);
  } else {
    const company = await getMyClientCompany();
    orgId = company?.organizationId ?? null;
  }
  if (!orgId) return errorResult('Keine Organisation zugeordnet.');

  const service = createSupabaseServiceClient();
  const { error } = await service.from('feedback').insert({
    organization_id: orgId,
    author_id: user.id,
    author_name: user.fullName ?? user.email,
    author_role: isAgency ? 'agency' : 'client',
    kind: parsed.data.kind,
    title: parsed.data.title,
    message: parsed.data.message || null,
  });
  if (error) return errorResult('Konnte nicht gesendet werden.');

  // Notify org admins so new feedback doesn't go unnoticed.
  const { data: admins } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  const kindLabel =
    parsed.data.kind === 'bug'
      ? '🐞 Fehler'
      : parsed.data.kind === 'idea'
        ? '💡 Idee'
        : '⭐ Wunsch';
  const recipients = (admins ?? [])
    .filter((m) => m.role === 'agency_admin' || m.role === 'super_admin')
    .map((m) => m.user_id)
    .filter((id) => id !== user.id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: orgId,
        recipientId,
        type: 'feedback' as const,
        title: `${kindLabel}: neues Feedback`,
        body: `${user.fullName ?? user.email}: ${parsed.data.title}`,
        entityType: 'feedback',
        entityId: null,
      })),
      user.id,
    );
  }

  return successResult('Danke! Dein Feedback ist beim Team angekommen.');
}

const statusValues = ['new', 'planned', 'in_progress', 'done', 'rejected'] as const;

async function requireAdminOrg(): Promise<string | null> {
  const user = await requireUser();
  const orgId = primaryAgencyOrgId(user);
  return orgId && isOrgAdmin(user, orgId) ? orgId : null;
}

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(statusValues).optional(),
  adminNotes: z.string().max(8000).optional(),
});

/** Admin: updates a feedback item's status and/or notes (prompts). */
export async function updateFeedbackAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return errorResult('Ungültige Werte.');
  const orgId = await requireAdminOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');

  const patch: { updated_at: string; status?: string; admin_notes?: string | null } = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.status) patch.status = parsed.data.status;
  if (parsed.data.adminNotes !== undefined) patch.admin_notes = parsed.data.adminNotes;

  const { error } = await createSupabaseServiceClient()
    .from('feedback')
    .update(patch)
    .eq('id', parsed.data.id)
    .eq('organization_id', orgId);
  if (error) return errorResult('Speichern fehlgeschlagen.');

  revalidatePath('/app/feedback');
  return successResult('Gespeichert.');
}

/** Admin: deletes a feedback item. */
export async function deleteFeedbackAction(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return errorResult('Ungültig.');
  const orgId = await requireAdminOrg();
  if (!orgId) return errorResult('Keine Berechtigung.');
  const { error } = await createSupabaseServiceClient()
    .from('feedback')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);
  if (error) return errorResult('Löschen fehlgeschlagen.');
  revalidatePath('/app/feedback');
  return successResult('Gelöscht.');
}
