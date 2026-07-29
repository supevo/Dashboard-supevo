'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireUser, authorize } from '@/lib/authz/authorize';
import { isAgencyStaffInOrg } from '@/lib/authz/policies';
import { logActivity } from '@/lib/audit';
import { env } from '@/lib/env';
import { de } from '@/lib/i18n/de';
import { logger } from '@/lib/logger';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import {
  generateInviteToken,
  hashInviteToken,
} from '@/features/invitations/token';
import {
  createInvitationSchema,
  invitationIdSchema,
} from '@/features/invitations/schema';
import { sendEmail } from '@/lib/email/send';
import { renderEmail } from '@/lib/email/templates';

const INVITE_TTL_DAYS = 7;

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

function inviteUrl(rawToken: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}/invite/${rawToken}`;
}

/** Sends the invitation link by email (no-op when email is not configured). */
async function sendInviteEmail(email: string, url: string): Promise<void> {
  const { html, text } = renderEmail({
    heading: 'Sie wurden zum Supevo Dashboard eingeladen',
    intro:
      'Sie haben eine Einladung erhalten. Klicken Sie auf den Button, um Ihren Zugang einzurichten.',
    bodyLines: ['Der Einladungslink ist 7 Tage gültig.'],
    ctaLabel: 'Einladung annehmen',
    ctaUrl: url,
  });
  await sendEmail({
    to: email,
    subject: 'Ihre Einladung zum Supevo Dashboard',
    html,
    text,
  });
}

/** Creates an invitation and returns a shareable link (email sending is a
 *  later phase; the link is surfaced to the admin for now). */
export async function createInvitationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createInvitationSchema.safeParse({
    orgId: formData.get('orgId'),
    email: formData.get('email'),
    role: formData.get('role'),
    clientCompanyId: formData.get('clientCompanyId') ?? '',
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }
  const { orgId, email, role, clientCompanyId } = parsed.data;

  const user = await requireUser();

  // Inviting a CLIENT contact scoped to a company may be done by any agency
  // staff member (they add clients). Inviting agency members stays admin-only.
  const isClientContactInvite =
    (role === 'client' || role === 'guest') && Boolean(clientCompanyId);
  if (isClientContactInvite && clientCompanyId) {
    if (!isAgencyStaffInOrg(user, orgId)) {
      return errorResult(de.errors.FORBIDDEN);
    }
    // The company must belong to this org (RLS-scoped read).
    const check = await createSupabaseServerClient();
    const { data: company } = await check
      .from('client_companies')
      .select('id')
      .eq('id', clientCompanyId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!company) return errorResult(de.errors.FORBIDDEN);
  } else {
    authorize(user, { type: 'invitation.manage', orgId });
  }

  const rawToken = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Admin invites go through RLS; client-contact invites by non-admin staff use
  // the service client (the invitations INSERT policy is admin-only).
  const supabase = isClientContactInvite
    ? createSupabaseServiceClient()
    : await createSupabaseServerClient();
  const { data: invite, error } = await supabase
    .from('invitations')
    .insert({
      organization_id: orgId,
      client_company_id: clientCompanyId ? clientCompanyId : null,
      email,
      role,
      token_hash: hashInviteToken(rawToken),
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error || !invite) {
    logger.warn('Einladung konnte nicht erstellt werden', {
      orgId,
      reason: error?.message,
    });
    // Most likely a duplicate active invitation for this email.
    return errorResult(
      'Für diese E-Mail besteht bereits eine offene Einladung.',
    );
  }

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'invite',
    entityType: 'invitation',
    entityId: invite.id,
    metadata: { email, role },
  });

  const url = inviteUrl(rawToken);
  await sendInviteEmail(email, url);

  revalidatePath('/app/team');
  return successResult('Einladung erstellt.', { inviteUrl: url });
}

/** Revokes an open invitation. */
export async function revokeInvitationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = invitationIdSchema.safeParse({
    invitationId: formData.get('invitationId'),
    orgId: formData.get('orgId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { invitationId, orgId } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'invitation.manage', orgId });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('organization_id', orgId)
    .is('accepted_at', null);

  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'invite_revoke',
    entityType: 'invitation',
    entityId: invitationId,
  });

  revalidatePath('/app/team');
  return successResult('Einladung widerrufen.');
}

/** Regenerates the token + expiry of an open invitation and returns a fresh
 *  link (the previous link is invalidated). */
export async function resendInvitationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = invitationIdSchema.safeParse({
    invitationId: formData.get('invitationId'),
    orgId: formData.get('orgId'),
  });
  if (!parsed.success) return errorResult(de.errors.VALIDATION);
  const { invitationId, orgId } = parsed.data;

  const user = await requireUser();
  authorize(user, { type: 'invitation.manage', orgId });

  const rawToken = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const supabase = await createSupabaseServerClient();
  const { data: updated, error } = await supabase
    .from('invitations')
    .update({ token_hash: hashInviteToken(rawToken), expires_at: expiresAt })
    .eq('id', invitationId)
    .eq('organization_id', orgId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('email')
    .maybeSingle();

  if (error) return errorResult(de.errors.INTERNAL);

  await logActivity({
    actorId: user.id,
    organizationId: orgId,
    action: 'invite_resend',
    entityType: 'invitation',
    entityId: invitationId,
  });

  const url = inviteUrl(rawToken);
  if (updated?.email) await sendInviteEmail(updated.email, url);

  revalidatePath('/app/team');
  return successResult('Neuer Einladungslink erstellt.', { inviteUrl: url });
}
