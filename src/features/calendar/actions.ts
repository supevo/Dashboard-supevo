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

const TIME = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .optional()
  .or(z.literal(''));

const createSchema = z.object({
  title: z.string().trim().min(1, 'Bitte einen Titel angeben.').max(200),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte gültiges Datum wählen.'),
  startTime: TIME,
  endTime: TIME,
  clientCompanyId: z.string().uuid().optional().or(z.literal('')),
  location: z.string().max(200).optional().or(z.literal('')),
  note: z.string().max(2000).optional().or(z.literal('')),
});

/** Creates a calendar event (agency staff), optionally linked to a client. */
export async function createEventAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    title: formData.get('title'),
    eventDate: formData.get('eventDate'),
    startTime: formData.get('startTime') ?? '',
    endTime: formData.get('endTime') ?? '',
    clientCompanyId: formData.get('clientCompanyId') ?? '',
    location: formData.get('location') ?? '',
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) {
    return errorResult(parsed.error.issues[0]?.message ?? de.errors.VALIDATION);
  }
  const d = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('calendar_events').insert({
    organization_id: orgId,
    title: d.title,
    event_date: d.eventDate,
    start_time: d.startTime ? d.startTime : null,
    end_time: d.endTime ? d.endTime : null,
    client_company_id: d.clientCompanyId ? d.clientCompanyId : null,
    location: d.location ? d.location : null,
    note: d.note ? d.note : null,
    created_by: user.id,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/app/calendar');
  return successResult('Termin angelegt.');
}

/** Deletes a calendar event. */
export async function deleteEventAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(formData.get('id'));
  if (!id.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id.data);
  if (error) return errorResult(de.errors.INTERNAL);

  revalidatePath('/app/calendar');
  return successResult('Termin gelöscht.');
}
