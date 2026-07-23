/**
 * Pure invitation validity check. Kept free of I/O so it is unit-testable and
 * shared by the acceptance action and the lookup query.
 */
export interface InvitationValidityFields {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}

export function isInvitationUsable(
  invite: InvitationValidityFields | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!invite) return false;
  if (invite.accepted_at) return false;
  if (invite.revoked_at) return false;
  if (new Date(invite.expires_at).getTime() <= nowMs) return false;
  return true;
}
