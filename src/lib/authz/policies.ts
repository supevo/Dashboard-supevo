import type { CurrentUser } from '@/features/auth/access';
import type { AppRole } from './roles';
import { canAssignRole } from './roles';

/**
 * Central permission model.
 *
 * `can(user, permission)` is the SINGLE source of truth for authorization in
 * server actions. It is a pure function (no I/O) so it is exhaustively
 * unit-testable and cannot be bypassed by scattered, inconsistent role checks.
 * Row Level Security remains the hard boundary underneath.
 */

export type Permission =
  | { type: 'organization.update'; orgId: string }
  | { type: 'organization.viewActivity'; orgId: string }
  | { type: 'member.list'; orgId: string }
  | { type: 'member.invite'; orgId: string }
  | {
      type: 'member.changeRole';
      orgId: string;
      targetUserId: string;
      nextRole: AppRole;
    }
  | { type: 'member.deactivate'; orgId: string; targetUserId: string }
  | { type: 'member.reactivate'; orgId: string; targetUserId: string }
  | { type: 'clientCompany.manage'; orgId: string }
  | { type: 'clientContact.manage'; orgId: string }
  | { type: 'invitation.manage'; orgId: string }
  | { type: 'project.create'; orgId: string };

/** True when the user holds the super_admin role in any organization. */
export function isSuperAdmin(user: CurrentUser): boolean {
  return user.memberships.some((m) => m.role === 'super_admin');
}

/** The user's active role in a given organization, or null. */
export function roleInOrg(user: CurrentUser, orgId: string): AppRole | null {
  const membership = user.memberships.find((m) => m.organizationId === orgId);
  return membership ? membership.role : null;
}

/** True when the user administers the given organization. */
export function isOrgAdmin(user: CurrentUser, orgId: string): boolean {
  return isSuperAdmin(user) || roleInOrg(user, orgId) === 'agency_admin';
}

/** True when the user is agency staff in the given organization. */
export function isAgencyStaffInOrg(user: CurrentUser, orgId: string): boolean {
  if (isSuperAdmin(user)) return true;
  const role = roleInOrg(user, orgId);
  return (
    role === 'agency_admin' ||
    role === 'project_manager' ||
    role === 'employee' ||
    role === 'freelancer'
  );
}

/** The single authorization decision function. */
export function can(user: CurrentUser, permission: Permission): boolean {
  switch (permission.type) {
    case 'organization.update':
    case 'member.invite':
    case 'clientCompany.manage':
    case 'clientContact.manage':
    case 'invitation.manage':
      return isOrgAdmin(user, permission.orgId);

    case 'organization.viewActivity':
    case 'member.list':
      return isOrgAdmin(user, permission.orgId);

    case 'project.create': {
      // Agency admins and project managers may create projects.
      const role = roleInOrg(user, permission.orgId);
      return (
        isSuperAdmin(user) ||
        role === 'agency_admin' ||
        role === 'project_manager'
      );
    }

    case 'member.changeRole': {
      const granterRole = roleInOrg(user, permission.orgId);
      if (!granterRole && !isSuperAdmin(user)) return false;
      return canAssignRole({
        granterRole: isSuperAdmin(user) ? 'super_admin' : granterRole!,
        granterUserId: user.id,
        targetUserId: permission.targetUserId,
        nextRole: permission.nextRole,
      });
    }

    case 'member.deactivate':
    case 'member.reactivate':
      // Admins may (de)activate others, never themselves.
      return (
        isOrgAdmin(user, permission.orgId) &&
        permission.targetUserId !== user.id
      );

    default: {
      // Exhaustiveness guard: a new permission must be handled explicitly.
      const _exhaustive: never = permission;
      return _exhaustive;
    }
  }
}
