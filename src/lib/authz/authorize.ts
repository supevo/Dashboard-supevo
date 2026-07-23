import 'server-only';
import { getCurrentUser } from '@/features/auth/session';
import type { CurrentUser } from '@/features/auth/access';
import { ForbiddenError, UnauthenticatedError } from '@/lib/errors';
import { can, type Permission } from './policies';

/**
 * Server-side authorization guards built on the central `can()` policy.
 * Every mutating server action calls `requireUser()` then `authorize()`.
 */

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** Throws ForbiddenError when the user lacks the permission. */
export function authorize(user: CurrentUser, permission: Permission): void {
  if (!can(user, permission)) {
    throw new ForbiddenError();
  }
}

/** Convenience: load the user and authorize in one step. */
export async function requirePermission(
  permission: Permission,
): Promise<CurrentUser> {
  const user = await requireUser();
  authorize(user, permission);
  return user;
}
