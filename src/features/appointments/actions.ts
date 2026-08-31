'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/features/auth/session';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { createNotifications } from '@/features/notifications/create';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { logger } from '@/lib/logger';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TIME = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .optional()
  .or(z.literal('').transform(() => undefined));

const requestSchema = z.object({
  topic: z.string().trim().min(1, 'Bitte ein Thema angeben.').max(200),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  opt1_date: DATE,
  opt1_time: TIME,
  opt2_date: DATE.optional().or(z.literal('').transform(() => undefined)),
  opt2_time: TIME,
  opt3_date: DATE.optional().or(z.literal('').transform(() => undefined)),
  opt3_time: TIME,
});

/** A client proposes up to three appointment slots. */
export async function requestAppointmentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const v = parsed.data;

  const user = await getCurrentUser();
  if (!user) return errorResult(de.errors.UNAUTHENTICATED);
  const company = await getMyClientCompany();
  if (!company) return errorResult(de.errors.FORBIDDEN);

  const service = createSupabaseServiceClient();
  const { error } = await service.from('appointment_requests').insert({
    organization_id: company.organizationId,
    client_company_id: company.clientCompanyId,
    created_by: user.id,
    topic: v.topic,
    note: v.note ? v.note : null,
    opt1_date: v.opt1_date,
    opt1_time: v.opt1_time ?? null,
    opt2_date: v.opt2_date ?? null,
    opt2_time: v.opt2_time ?? null,
    opt3_date: v.opt3_date ?? null,
    opt3_time: v.opt3_time ?? null,
  });
  if (error) {
    logger.error('[appointments] request insert failed', {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return errorResult(
      error.code === '42P01'
        ? 'Termin-Tabelle fehlt (Migration 0088 nicht ausgeführt).'
        : de.errors.INTERNAL,
    );
  }

  // Notify the agency's managers of the new request.
  const { data: staff } = await service
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', company.organizationId)
    .eq('status', 'active');
  const recipients = [
    ...new Set(
      (staff ?? [])
        .filter((m) => ['agency_admin', 'project_manager', 'super_admin'].includes(m.role))
        .map((m) => m.user_id),
    ),
  ];
  if (recipients.length > 0) {
    await createNotifications(
      recipients.map((recipientId) => ({
        organizationId: company.organizationId,
        recipientId,
        type: 'appointment' as const,
        title: '📅 Neue Terminanfrage',
        body: v.topic,
        entityType: 'appointment',
        entityId: null,
      })),
      user.id,
    );
  }

  revalidatePath('/portal/appointments');
  return successResult('Terminanfrage gesendet. Wir bestätigen zeitnah einen Termin.');
}

type AgencyResult = { ok: true } | { ok: false; error: string };

/** Agency confirms one of the proposed slots → creates a calendar event. */
export async function confirmAppointmentAction(
  requestId: string,
  slotIndex: 1 | 2 | 3,
): Promise<AgencyResult> {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) return { ok: false, error: de.errors.FORBIDDEN };

  const service = createSupabaseServiceClient();
  const { data: req } = await service
    .from('appointment_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: de.errors.NOT_FOUND };
  if (primaryAgencyOrgId(user) !== req.organization_id) {
    return { ok: false, error: de.errors.FORBIDDEN };
  }
  if (req.status !== 'requested') return { ok: false, error: 'Bereits bearbeitet.' };

  const date =
    slotIndex === 1 ? req.opt1_date : slotIndex === 2 ? req.opt2_date : req.opt3_date;
  const time =
    slotIndex === 1 ? req.opt1_time : slotIndex === 2 ? req.opt2_time : req.opt3_time;
  if (!date) return { ok: false, error: 'Dieser Terminvorschlag existiert nicht.' };

  const { data: event } = await service
    .from('calendar_events')
    .insert({
      organization_id: req.organization_id,
      title: `Termin: ${req.topic}`,
      event_date: date,
      start_time: time ?? null,
      client_company_id: req.client_company_id,
      note: req.note,
    })
    .select('id')
    .maybeSingle();

  await service
    .from('appointment_requests')
    .update({
      status: 'confirmed',
      confirmed_date: date,
      confirmed_time: time ?? null,
      confirmed_by: user.id,
      calendar_event_id: event?.id ?? null,
    })
    .eq('id', requestId);

  if (req.created_by) {
    const pretty = date.split('-').reverse().join('.');
    await createNotifications([
      {
        organizationId: req.organization_id,
        recipientId: req.created_by,
        type: 'appointment' as const,
        title: '✅ Termin bestätigt',
        body: `„${req.topic}" am ${pretty}${time ? ` um ${time} Uhr` : ''}.`,
        entityType: 'appointment',
        entityId: requestId,
      },
    ]);
  }

  revalidatePath('/app/calendar');
  return { ok: true };
}

/** Agency declines a request (e.g. none of the slots fit). */
export async function declineAppointmentAction(
  requestId: string,
): Promise<AgencyResult> {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) return { ok: false, error: de.errors.FORBIDDEN };

  const service = createSupabaseServiceClient();
  const { data: req } = await service
    .from('appointment_requests')
    .select('id, organization_id, status, topic, created_by')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: de.errors.NOT_FOUND };
  if (primaryAgencyOrgId(user) !== req.organization_id) {
    return { ok: false, error: de.errors.FORBIDDEN };
  }
  if (req.status !== 'requested') return { ok: false, error: 'Bereits bearbeitet.' };

  await service
    .from('appointment_requests')
    .update({ status: 'declined' })
    .eq('id', requestId);

  if (req.created_by) {
    await createNotifications([
      {
        organizationId: req.organization_id,
        recipientId: req.created_by,
        type: 'appointment' as const,
        title: 'Terminanfrage – bitte neue Zeiten',
        body: `Zu „${req.topic}" hat leider keiner der Vorschläge gepasst. Bitte schlagt neue Zeiten vor.`,
        entityType: 'appointment',
        entityId: requestId,
      },
    ]);
  }

  revalidatePath('/app/calendar');
  return { ok: true };
}
