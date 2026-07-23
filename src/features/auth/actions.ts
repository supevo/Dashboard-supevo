'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { de } from '@/lib/i18n/de';
import { safeRedirectPath } from '@/lib/safe-redirect';
import {
  type ActionResult,
  errorResult,
  successResult,
} from '@/lib/action-result';
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './schema';
import { getCurrentUser, landingPathFor } from './session';
import { hashInviteToken } from '@/features/invitations/token';
import { isInvitationUsable } from '@/features/invitations/validity';

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

/** Sign in with email + password. Redirects to a safe landing route. */
export async function signInAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    redirectTo: formData.get('redirectTo') ?? undefined,
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Do not reveal whether the email exists.
    return errorResult(de.errors.invalidCredentials);
  }

  const user = await getCurrentUser();
  const fallback = user ? landingPathFor(user) : '/';
  redirect(safeRedirectPath(parsed.data.redirectTo, fallback));
}

/** Signs the current user out and returns to the login page. */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * Requests a password reset email. Always returns success to avoid user
 * enumeration.
 */
export async function requestPasswordResetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${env.NEXT_PUBLIC_APP_URL}/reset-password` },
  );
  if (error) {
    logger.warn('Passwort-Reset fehlgeschlagen', { reason: error.message });
  }

  // Generic response regardless of outcome.
  return successResult(de.auth.genericResetSent);
}

/** Sets a new password for the user in the current (recovery) session. */
export async function resetPasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResult(de.errors.UNAUTHENTICATED);
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    logger.error('Passwortänderung fehlgeschlagen', { userId: user.id });
    return errorResult(de.errors.INTERNAL);
  }

  return successResult();
}

/**
 * Accepts an invitation: creates the auth user, profile and membership, then
 * marks the invitation as accepted. Registration is only possible through a
 * valid, unexpired, unrevoked invitation whose email matches.
 */
export async function acceptInviteAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = acceptInviteSchema.safeParse({
    token: formData.get('token'),
    fullName: formData.get('fullName'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return errorResult(de.errors.VALIDATION, fieldErrorsOf(parsed.error));
  }

  const service = createSupabaseServiceClient();
  const tokenHash = hashInviteToken(parsed.data.token);

  const { data: invite } = await service
    .from('invitations')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!invite || !isInvitationUsable(invite)) {
    return errorResult(de.errors.invalidInvite);
  }

  // Create the auth user (email pre-confirmed via invitation).
  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email: invite.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName },
    });

  if (createError || !created.user) {
    logger.error('Konto-Erstellung aus Einladung fehlgeschlagen', {
      invitationId: invite.id,
      reason: createError?.message,
    });
    return errorResult(de.errors.INTERNAL);
  }

  const userId = created.user.id;

  const { error: profileError } = await service.from('profiles').insert({
    id: userId,
    full_name: parsed.data.fullName,
    email: invite.email,
  });
  const { error: membershipError } = await service.from('memberships').insert({
    user_id: userId,
    organization_id: invite.organization_id,
    role: invite.role,
    status: 'active',
  });

  if (profileError || membershipError) {
    logger.error('Profil/Mitgliedschaft aus Einladung fehlgeschlagen', {
      invitationId: invite.id,
    });
    return errorResult(de.errors.INTERNAL);
  }

  // Client/guest invitations tied to a client company create the contact link.
  if (
    (invite.role === 'client' || invite.role === 'guest') &&
    invite.client_company_id
  ) {
    await service.from('client_contacts').insert({
      organization_id: invite.organization_id,
      client_company_id: invite.client_company_id,
      user_id: userId,
    });
  }

  await service
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  logger.info('Einladung angenommen', {
    invitationId: invite.id,
    organizationId: invite.organization_id,
    role: invite.role,
  });

  // Sign the new user in immediately.
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signInWithPassword({
    email: invite.email,
    password: parsed.data.password,
  });

  return successResult();
}
