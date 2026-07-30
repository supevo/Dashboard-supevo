'use server';

import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser } from '@/lib/authz/authorize';
import { hasAgencyAccess } from '@/features/auth/access';
import { sendEmailResult, isEmailEnabled } from '@/lib/email/send';
import { renderEmail } from '@/lib/email/templates';
import { logActivity } from '@/lib/audit';
import { de } from '@/lib/i18n/de';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import { gatherClientWeek, getRecapRecipients } from './context';
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

  const [ctx, recipients] = await Promise.all([
    gatherClientWeek(parsed.data.clientCompanyId),
    getRecapRecipients(parsed.data.clientCompanyId),
  ]);
  if (!ctx.hasActivity) {
    return successResult('', {
      hasActivity: false,
      recipients,
    });
  }

  const draft = await generateRecap(ctx);
  if (!draft) return errorResult(de.errors.INTERNAL);

  return successResult('', {
    hasActivity: true,
    draft,
    recipients,
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
    .select('name, organization_id')
    .eq('id', clientCompanyId)
    .maybeSingle();
  if (!company) return errorResult(de.errors.FORBIDDEN);

  // Recipients: the client's contact persons (the people actually working in the
  // portal). Company contact_email is only a fallback (handled in the helper).
  const recipients = await getRecapRecipients(clientCompanyId);
  if (recipients.length === 0) {
    return errorResult(
      'Für diesen Kunden sind keine Ansprechpartner mit E-Mail-Adresse hinterlegt.',
    );
  }

  // The draft already carries the greeting ("Hallo, anbei euer Wochenrückblick")
  // and the sign-off ("Mit besten Grüßen / supevo Team"), so the wrapper adds no
  // extra intro/footer greeting.
  const { html, text } = renderEmail({
    heading: '',
    intro: '',
    bodyLines: body.split('\n').filter(Boolean),
  });
  const sent = await sendEmailResult({
    to: recipients,
    subject: 'Ihr Wochenrückblick',
    html,
    text,
  });
  if (!sent.ok) {
    return errorResult(
      `E-Mail konnte nicht gesendet werden: ${sent.error ?? de.errors.INTERNAL}`,
    );
  }

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
