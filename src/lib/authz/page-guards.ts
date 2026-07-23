import 'server-only';
import { redirect } from 'next/navigation';
import {
  getCurrentUser,
  primaryAgencyOrgId,
  primaryClientOrgId,
} from '@/features/auth/session';
import type { CurrentUser } from '@/features/auth/access';
import { isOrgAdmin } from './policies';

/**
 * Resolves the current user and their agency organization for internal pages.
 * Redirects unauthenticated users to /login and non-agency users to /forbidden.
 */
export async function requireAgencyPage(): Promise<{
  user: CurrentUser;
  orgId: string;
}> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) redirect('/forbidden');
  return { user, orgId };
}

/** Like requireAgencyPage but additionally requires organization admin rights. */
export async function requireOrgAdminPage(): Promise<{
  user: CurrentUser;
  orgId: string;
}> {
  const { user, orgId } = await requireAgencyPage();
  if (!isOrgAdmin(user, orgId)) redirect('/forbidden');
  return { user, orgId };
}

/** Resolves the current user and their client organization for portal pages. */
export async function requireClientPage(): Promise<{
  user: CurrentUser;
  orgId: string;
}> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const orgId = primaryClientOrgId(user);
  if (!orgId) redirect('/forbidden');
  return { user, orgId };
}
