/**
 * Role definitions – the application-side mirror of the database enums and
 * the role matrix (see docs/architecture/04-role-matrix.md).
 *
 * RLS in PostgreSQL remains the hard security boundary. This module provides
 * the single source of truth for role checks in server actions so that role
 * logic is never scattered or contradictory.
 */

export const APP_ROLES = [
  'super_admin',
  'agency_admin',
  'project_manager',
  'employee',
  'freelancer',
  'client',
  'guest',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Roles that belong to the agency (internal staff). */
export const AGENCY_ROLES = [
  'agency_admin',
  'project_manager',
  'employee',
  'freelancer',
] as const satisfies readonly AppRole[];

/** External roles (customer side). */
export const EXTERNAL_ROLES = ['client', 'guest'] as const satisfies readonly AppRole[];

/**
 * Rank for privilege comparison. Higher = more privileged. Used to enforce
 * "no one may raise their own rights" and admin-only role changes.
 */
export const ROLE_RANK: Record<AppRole, number> = {
  super_admin: 100,
  agency_admin: 80,
  project_manager: 60,
  employee: 40,
  freelancer: 30,
  client: 20,
  guest: 10,
};

export function isAgencyRole(role: AppRole): boolean {
  return (AGENCY_ROLES as readonly AppRole[]).includes(role);
}

export function isExternalRole(role: AppRole): boolean {
  return (EXTERNAL_ROLES as readonly AppRole[]).includes(role);
}

/**
 * Agency staff may see internal data (comments, files, notes, time entries)
 * for projects they can access. External roles never can.
 */
export function canSeeInternal(role: AppRole): boolean {
  return role === 'super_admin' || isAgencyRole(role);
}

/**
 * Roles that a granting role is allowed to assign. Enforces:
 * - super_admin is never assignable via the UI (empty for everyone).
 * - agency_admin may assign up to agency_admin.
 * - project_manager may not assign global roles (handled at project level).
 */
export function assignableRoles(granter: AppRole): AppRole[] {
  switch (granter) {
    case 'super_admin':
      return ['agency_admin', 'project_manager', 'employee', 'freelancer', 'client', 'guest'];
    case 'agency_admin':
      return ['agency_admin', 'project_manager', 'employee', 'freelancer', 'client', 'guest'];
    default:
      return [];
  }
}

/**
 * Whether `granter` may set `target`'s role to `nextRole` on membership
 * `targetUserId`. Prevents self-escalation and super_admin assignment.
 */
export function canAssignRole(params: {
  granterRole: AppRole;
  granterUserId: string;
  targetUserId: string;
  nextRole: AppRole;
}): boolean {
  const { granterRole, granterUserId, targetUserId, nextRole } = params;

  // super_admin is never grantable through the application layer.
  if (nextRole === 'super_admin') return false;

  // No one may change their own role (prevents self-escalation).
  if (granterUserId === targetUserId) return false;

  return assignableRoles(granterRole).includes(nextRole);
}
