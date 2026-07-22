import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { hashInviteToken } from './token';

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
  const { data: invite } = await service
    .from('invitations')
    .select('id, email, organization_id, accepted_at, revoked_at, expires_at')
    .eq('token_hash', hashInviteToken(rawToken))
    .maybeSingle();

  if (!invite) return null;
  if (invite.accepted_at || invite.revoked_at) return null;
  if (new Date(invite.expires_at).getTime() <= Date.now()) return null;

  return {
    id: invite.id,
    email: invite.email,
    organizationId: invite.organization_id,
  };
}
