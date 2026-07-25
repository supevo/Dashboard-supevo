import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { AppRole } from '@/lib/authz/roles';
import { hashInviteToken } from './token';
import { isInvitationUsable } from './validity';

export interface ValidInvitation {
  id: string;
  email: string;
  organizationId: string;
}

/**
 * Looks up an invitation by its raw token and returns it only if it is still
 * valid (not accepted, not revoked, not expired). Uses the service client
 * because the invitee is not yet authenticated; no sensitive fields are
 * returned to the caller.
 */
export async function getValidInvitationByToken(
  rawToken: string,
): Promise<ValidInvitation | null> {
  if (!rawToken || rawToken.length < 20) return null;

  const service = createSupabaseServiceClient();
  const { data: invite, error } = await service
    .from('invitations')
    .select('id, email, organization_id, accepted_at, revoked_at, expires_at')
    .eq('token_hash', hashInviteToken(rawToken))
    .maybeSingle();

  if (error) {
    // A permission error here usually means SUPABASE_SERVICE_ROLE_KEY is not
    // the real service/secret key (RLS blocks the read). Surface it in logs.
    logger.error('Einladungs-Lookup fehlgeschlagen', { reason: error.message });
    return null;
  }
  if (!invite) {
    logger.warn('Einladung nicht gefunden (Token stimmt nicht überein)');
    return null;
  }
  if (!isInvitationUsable(invite)) {
    logger.warn('Einladung nicht mehr gültig', {
      accepted: Boolean(invite.accepted_at),
      revoked: Boolean(invite.revoked_at),
      expiresAt: invite.expires_at,
    });
    return null;
  }

  return {
    id: invite.id,
    email: invite.email,
    organizationId: invite.organization_id,
  };
}

export interface OpenInvitation {
  id: string;
  email: string;
  role: AppRole;
  clientCompanyId: string | null;
  expiresAt: string;
  createdAt: string;
}

/**
 * Lists open (not accepted, not revoked) invitations for an organization.
 * RLS restricts visibility to org admins.
 */
export async function listOpenInvitations(
  orgId: string,
): Promise<OpenInvitation[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('invitations')
    .select('id, email, role, client_company_id, expires_at, created_at')
    .eq('organization_id', orgId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  return (data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    clientCompanyId: i.client_company_id,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
  }));
}
