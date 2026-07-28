'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { createNotifications } from '@/features/notifications/create';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte gültiges Datum wählen.');

/** Vacation must be requested at least this many days ahead (no spontaneous
 *  leave via the portal). Sick / other absences are exempt. */
const MIN_VACATION_LEAD_DAYS = 14;

function minVacationStart(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + MIN_VACATION_LEAD_DAYS);
  return d.toISOString().slice(0, 10);
}

const requestSchema = z
  .object({
    type: z.enum(['urlaub', 'krank', 'sonstiges']),
    startDate: DATE,
    endDate: DATE,
    note: z.string().max(1000).optional().or(z.literal('')),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'Das Enddatum darf nicht vor dem Startdatum liegen.',
    path: ['endDate'],
  });

/** A staff member requests an absence (vacation / sick / other). */
export async function requestAbsenceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = requestSchema.safeParse({
    type: formData.get('type'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }

  // No spontaneous vacation: must be at least two weeks ahead.
  if (parsed.data.type === 'urlaub' && parsed.data.startDate < minVacationStart()) {
    return errorResult(
      'Urlaub muss mindestens 2 Wochen im Voraus beantragt werden.',
    );
  }

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('absences').insert({
    organization_id: orgId,
    user_id: user.id,
    type: parsed.data.type,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    note: parsed.data.note ? parsed.data.note : null,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  // Notify org admins about the new request.
  const service = createSupabaseServiceClient();
  const { data: admins } = await service
    .from('memberships')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('role', 'agency_admin')
    .eq('status', 'active');
  const recipients = (admins ?? [])
    .map((a) => a.user_id)
    .filter((id) => id !== user.id);
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: orgId,
        recipientId,
        type: 'absence' as const,
        title: 'Neuer Abwesenheitsantrag',
        body: `${user.fullName ?? user.email}: ${parsed.data.startDate}–${parsed.data.endDate}`,
        entityType: 'absence',
        entityId: null,
      })),
      user.id,
    );
  }

  revalidatePath('/app/absences');
  return successResult('Antrag eingereicht.');
}

const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(1000).optional().or(z.literal('')),
});

/** An org admin approves or rejects an absence request. */
export async function decideAbsenceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = decideSchema.safeParse({
    id: formData.get('id'),
    decision: formData.get('decision'),
    comment: formData.get('comment') ?? '',
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // RLS only lets org admins update others' requests; count confirms authority.
  const { data: updated, error } = await supabase
    .from('absences')
    .update({
      status: parsed.data.decision,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      decision_comment: parsed.data.comment ? parsed.data.comment : null,
    })
    .eq('id', parsed.data.id)
    .eq('status', 'pending')
    .select('user_id, organization_id, start_date, end_date')
    .maybeSingle();
  if (error) return errorResult(de.errors.FORBIDDEN);
  if (!updated) return errorResult(de.errors.FORBIDDEN);

  // Notify the requester of the decision.
  if (updated.user_id !== user.id) {
    await createNotifications(
      [
        {
          organizationId: updated.organization_id,
          recipientId: updated.user_id,
          type: 'absence' as const,
          title:
            parsed.data.decision === 'approved'
              ? 'Abwesenheit genehmigt'
              : 'Abwesenheit abgelehnt',
          body: `${updated.start_date}–${updated.end_date}`,
          entityType: 'absence',
          entityId: null,
        },
      ],
      user.id,
    );
  }

  revalidatePath('/app/absences');
  return successResult('Entscheidung gespeichert.');
}

/** Requester cancels/withdraws their own pending request. */
export async function cancelAbsenceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('absences').delete().eq('id', id.data);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/absences');
  return successResult('Antrag zurückgezogen.');
}
