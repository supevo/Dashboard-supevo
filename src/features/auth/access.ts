import type { AppRole } from '@/lib/authz/roles';
import { isAgencyRole } from '@/lib/authz/roles';
import type { MembershipStatus } from '@/lib/database.types';

/**
 * Pure, server-agnostic access helpers derived from a user's memberships.
 * Kept free of any `server-only` import so they are directly unit-testable.
 */

export interface MembershipInfo {
  organizationId: string;
  role: AppRole;
  status: MembershipStatus;
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  memberships: MembershipInfo[];
}

/** True when the user holds any agency role in any organization. */
export function hasAgencyAccess(user: CurrentUser): boolean {
  return user.memberships.some((m) => isAgencyRole(m.role));
}

/** True when the user holds an external (client/guest) role. */
export function hasClientAccess(user: CurrentUser): boolean {
  return user.memberships.some((m) => m.role === 'client' || m.role === 'guest');
}

/**
 * Landing route after login. Agency staff go to the internal app, external
 * users to the client portal, everyone else to a no-access page.
 */
export function landingPathFor(user: CurrentUser): string {
  if (hasAgencyAccess(user)) return '/app';
  if (hasClientAccess(user)) return '/portal';
  return '/no-access';
}
