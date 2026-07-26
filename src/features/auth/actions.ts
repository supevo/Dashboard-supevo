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

/**
 * Finds an existing auth user by email (case-insensitive) via the admin API.
 * Used to recover from a partially-created account so invitation acceptance is
 * idempotent. Pages through the user list; fine for the expected user counts.
 */
async function findAuthUserByEmail(
  service: ReturnType<typeof createSupabaseServiceClient>,
  email: string,
): Promise<{ id: string } | null> {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error || !data) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return { id: match.id };
    if (data.users.length < perPage) break;
  }
  return null;
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

  const { data: invite, error: lookupError } = await service
    .from('invitations')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (lookupError) {
    logger.error('Einladungs-Lookup (Annahme) fehlgeschlagen', {
      reason: lookupError.message,
    });
    return errorResult(de.errors.invalidInvite);
  }
  if (!invite || !isInvitationUsable(invite)) {
    logger.warn('Einladung bei Annahme ungültig', {
      found: Boolean(invite),
      accepted: Boolean(invite?.accepted_at),
      revoked: Boolean(invite?.revoked_at),
    });
    return errorResult(de.errors.invalidInvite);
  }

  // Create the auth user (email pre-confirmed via invitation). If one already
  // exists for this email (e.g. an orphan from an earlier failed attempt),
  // adopt it so the whole acceptance stays idempotent.
  let userId: string;
  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email: invite.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName },
    });

  if (created?.user) {
    userId = created.user.id;
  } else {
    const existing = await findAuthUserByEmail(service, invite.email);
    if (!existing) {
      logger.error('Konto-Erstellung aus Einladung fehlgeschlagen', {
        invitationId: invite.id,
        reason: createError?.message,
      });
      return errorResult(de.errors.INTERNAL);
    }
    // Genuine duplicate: the account already belongs to this organization.
    const { data: existingMembership } = await service
      .from('memberships')
      .select('id')
      .eq('user_id', existing.id)
      .eq('organization_id', invite.organization_id)
      .maybeSingle();
    if (existingMembership) {
      logger.warn('Einladung: Konto existiert bereits in der Organisation', {
        invitationId: invite.id,
      });
      return errorResult(de.errors.accountExists);
    }
    // Orphan account from a failed attempt: set the chosen password and adopt.
    const { error: updateError } = await service.auth.admin.updateUserById(
      existing.id,
      {
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.fullName },
      },
    );
    if (updateError) {
      logger.error('Konto-Übernahme aus Einladung fehlgeschlagen', {
        invitationId: invite.id,
        reason: updateError.message,
      });
      return errorResult(de.errors.INTERNAL);
    }
    userId = existing.id;
  }

  // Upsert profile + membership so a retry never fails on a duplicate row.
  const { error: profileError } = await service.from('profiles').upsert(
    { id: userId, full_name: parsed.data.fullName, email: invite.email },
    { onConflict: 'id' },
  );
  const { error: membershipError } = await service.from('memberships').upsert(
    {
      user_id: userId,
      organization_id: invite.organization_id,
      role: invite.role,
      status: 'active',
    },
    { onConflict: 'user_id,organization_id' },
  );

  if (profileError || membershipError) {
    logger.error('Profil/Mitgliedschaft aus Einladung fehlgeschlagen', {
      invitationId: invite.id,
      profileError: profileError?.message,
      membershipError: membershipError?.message,
    });
    return errorResult(de.errors.INTERNAL);
  }

  // Client/guest invitations tied to a client company create the contact link
  // (guarded so a retry does not create a duplicate contact row).
  if (
    (invite.role === 'client' || invite.role === 'guest') &&
    invite.client_company_id
  ) {
    const { data: existingContact } = await service
      .from('client_contacts')
      .select('id')
      .eq('client_company_id', invite.client_company_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existingContact) {
      await service.from('client_contacts').insert({
        organization_id: invite.organization_id,
        client_company_id: invite.client_company_id,
        user_id: userId,
      });
    }
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

  // Redirect server-side rather than returning success and letting the client
  // navigate. After a server action Next re-renders the invite page, whose
  // invitation is now consumed (accepted_at set) and would flash the
  // "invalid or expired" alert; a server redirect skips that stale render.
  // The root route resolves the correct landing path from the fresh session.
  redirect('/');
}
