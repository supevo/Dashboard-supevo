import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Invitation tokens.
 *
 * The raw token is sent to the invitee (in the link) and never stored. Only
 * its SHA-256 hash is persisted in `invitations.token_hash`, so a database
 * leak cannot be used to accept invitations.
 */

/** Generates a new URL-safe random invitation token (raw, to be emailed). */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hashes a raw token for storage / lookup. */
export function hashInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Constant-time comparison of two token hashes. */
export function tokenHashesMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
