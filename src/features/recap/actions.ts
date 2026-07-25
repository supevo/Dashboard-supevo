'use server';

import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { sendEmail, isEmailEnabled } from '@/lib/email/send';
import { renderEmail } from '@/lib/email/templates';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { gatherClientWeek } from './context';
import { generateRecap } from './generate';

const idSchema = z.object({ clientCompanyId: z.string().uuid() });

/** Agency: builds an AI draft weekly recap for a client. */
export async function createRecapDraftAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);

  const ctx = await gatherClientWeek(parsed.data.clientCompanyId);
  if (!ctx.hasActivity) {
    return successResult('', {
      hasActivity: false,
      contactEmail: ctx.contactEmail,
    });
  }

  const draft = await generateRecap(ctx);
  if (!draft) return errorResult(de.errors.INTERNAL);

  return successResult('', {
    hasActivity: true,
    draft,
    contactEmail: ctx.contactEmail,
  });
}

const sendSchema = z.object({
  clientCompanyId: z.string().uuid(),
  body: z.string().trim().min(10).max(20000),
});

/** Agency: sends the (edited) recap by email to the client's contact address. */
export async function sendRecapAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = sendSchema.safeParse({
    clientCompanyId: formData.get('clientCompanyId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { clientCompanyId, body } = parsed.data;

  const user = await requireUser();
  if (!hasAgencyAccess(user)) return errorResult(de.errors.FORBIDDEN);
  if (!isEmailEnabled()) {
    return errorResult('E-Mail-Versand ist nicht konfiguriert.');
  }

  const service = createSupabaseServiceClient();
  const { data: company } = await service
    .from('client_companies')
    .select('name, contact_email, organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) return errorResult(de.errors.FORBIDDEN);
  if (!company.contact_email) {
    return errorResult('Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.');
  }

  const { html, text } = renderEmail({
    heading: 'Ihr Wochenrückblick',
    intro: `Guten Tag,`,
    bodyLines: body.split('\n').filter(Boolean),
    footer: 'Mit freundlichen Grüßen\nIhr Supevo-Team',
  });
  const ok = await sendEmail({
    to: company.contact_email,
    subject: 'Ihr Wochenrückblick',
    html,
    text,
  });
  if (!ok) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: company.organization_id,
    action: 'update',
    entityType: 'client_company',
    entityId: clientCompanyId,
    metadata: { recapSent: true },
  });

  return successResult('Rückblick an den Kunden gesendet.');
}
