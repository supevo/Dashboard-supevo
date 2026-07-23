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

/**
 * The organization the user administers or works in as agency staff. In v1
 * there is a single agency organization, so the first agency membership wins.
 * Returns null for users without any agency membership.
 */
export function primaryAgencyOrgId(user: CurrentUser): string | null {
  const membership = user.memberships.find(
    (m) =>
      m.role === 'agency_admin' ||
      m.role === 'project_manager' ||
      m.role === 'employee' ||
      m.role === 'freelancer' ||
      m.role === 'super_admin',
  );
  return membership ? membership.organizationId : null;
}
