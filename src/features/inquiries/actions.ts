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

const STATUSES = [
  'new',
  'not_reached',
  'reached',
  'appointment',
  'offer',
  'won',
  'lost',
  // Legacy weiterhin zulässig (Bestandsdaten).
  'called',
  'mailed',
  'done',
] as const;

/** Sets an inquiry's status (agency or client). RLS gates access. */
export async function setInquiryStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      status: z.enum(STATUSES),
    })
    .safeParse({ id: formData.get('id'), status: formData.get('status') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('web_inquiries')
    // Cast: die neuen Enum-Werte (Migration 0175) stehen noch nicht in den
    // generierten DB-Typen.
    .update({ status: parsed.data.status } as never)
    .eq('id', parsed.data.id);
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/portal/inquiries');
  return successResult('Status aktualisiert.');
}

/** Markiert eine Anfrage als Spam bzw. hebt die Markierung auf (Agentur). */
export async function setInquirySpamAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ id: z.string().uuid(), isSpam: z.enum(['true', 'false']) })
    .safeParse({ id: formData.get('id'), isSpam: formData.get('isSpam') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('web_inquiries')
    .update({ is_spam: parsed.data.isSpam === 'true' })
    .eq('id', parsed.data.id);
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/portal/inquiries');
  return successResult(
    parsed.data.isSpam === 'true' ? 'Als Spam markiert.' : 'Kein Spam.',
  );
}

/** Adds a comment to an inquiry (agency or client). */
export async function addInquiryCommentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      inquiryId: z.string().uuid(),
      body: z.string().trim().min(1).max(2000),
    })
    .safeParse({
      inquiryId: formData.get('inquiryId'),
      body: formData.get('body'),
    });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Resolve org + company from the inquiry (RLS ensures the user may see it).
  const { data: inquiry } = await supabase
    .from('web_inquiries')
    .select('organization_id, client_company_id')
    .eq('id', parsed.data.inquiryId)
    .maybeSingle();
  if (!inquiry) return errorResult(de.errors.FORBIDDEN);

  const { error } = await supabase.from('inquiry_comments').insert({
    inquiry_id: parsed.data.inquiryId,
    organization_id: inquiry.organization_id,
    client_company_id: inquiry.client_company_id,
    author_id: user.id,
    body: parsed.data.body,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath('/portal/inquiries');
  return successResult('Kommentar hinzugefügt.');
}

/** Ensures an endpoint exists and toggles its enabled flag (agency). */
export async function toggleInquiryEndpointAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      clientCompanyId: z.string().uuid(),
      enabled: z.string(),
    })
    .safeParse({
      clientCompanyId: formData.get('clientCompanyId'),
      enabled: formData.get('enabled'),
    });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const enabled = parsed.data.enabled === 'true';
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('inquiry_endpoints').upsert(
    {
      client_company_id: parsed.data.clientCompanyId,
      organization_id: orgId,
      enabled,
    },
    { onConflict: 'client_company_id' },
  );
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  return successResult(enabled ? 'Aktiviert.' : 'Deaktiviert.');
}

/**
 * Schaltet die Sichtbarkeit des Kundenanfragen-Boards im Kundenportal um.
 * Agentur only. Legt bei Bedarf einen Endpoint-Eintrag an.
 */
export async function toggleInquiryClientVisibleAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ clientCompanyId: z.string().uuid(), visible: z.string() })
    .safeParse({
      clientCompanyId: formData.get('clientCompanyId'),
      visible: formData.get('visible'),
    });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const visible = parsed.data.visible === 'true';
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('inquiry_endpoints').upsert(
    {
      client_company_id: parsed.data.clientCompanyId,
      organization_id: orgId,
      client_visible: visible,
    },
    { onConflict: 'client_company_id' },
  );
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  revalidatePath('/portal/inquiries');
  return successResult(
    visible ? 'Für den Kunden sichtbar.' : 'Für den Kunden ausgeblendet.',
  );
}

/** Regenerates the webhook token (invalidates the old URL). Agency only. */
export async function regenerateInquiryTokenAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ clientCompanyId: z.string().uuid() })
    .safeParse({ clientCompanyId: formData.get('clientCompanyId') });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return errorResult(de.errors.FORBIDDEN);

  const supabase = await createSupabaseServerClient();
  // Delete + re-insert so the DB default mints a fresh token; keep enabled state.
  const { data: existing } = await supabase
    .from('inquiry_endpoints')
    .select('enabled')
    .eq('client_company_id', parsed.data.clientCompanyId)
    .maybeSingle();
  await supabase
    .from('inquiry_endpoints')
    .delete()
    .eq('client_company_id', parsed.data.clientCompanyId);
  const { error } = await supabase.from('inquiry_endpoints').insert({
    client_company_id: parsed.data.clientCompanyId,
    organization_id: orgId,
    enabled: existing?.enabled ?? true,
  });
  if (error) return errorResult(de.errors.FORBIDDEN);

  revalidatePath(`/app/clients/${parsed.data.clientCompanyId}`);
  return successResult('Neue URL erstellt.');
}
