import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getOneDriveConfig } from '@/lib/onedrive/config';
import { exchangeCodeAndStore } from '@/lib/onedrive/graph';
import { env } from '@/lib/env';

const STATE_COOKIE = 'od_oauth_state';

/**
 * Redirects back to the settings OneDrive card. On failure it carries a machine
 * reason and a short human-readable detail so the exact cause is visible on
 * screen (no need to read server logs).
 */
function settingsRedirect(
  status: string,
  reason?: string,
  detail?: string,
): NextResponse {
  const url = new URL('/app/settings', env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set('onedrive', status);
  if (reason) url.searchParams.set('od_reason', reason);
  if (detail) url.searchParams.set('od_detail', detail.slice(0, 300));
  url.hash = 'onedrive';
  const res = NextResponse.redirect(url.toString());
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/** OAuth callback: exchanges the code and stores the encrypted refresh token. */
export async function GET(request: NextRequest) {
  if (!getOneDriveConfig()) return settingsRedirect('error', 'not_configured');

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const savedState = request.cookies.get(STATE_COOKIE)?.value;
  // Microsoft can return its own error (e.g. consent declined) instead of a code.
  const msError = request.nextUrl.searchParams.get('error');
  if (msError) {
    const desc = request.nextUrl.searchParams.get('error_description') ?? '';
    return settingsRedirect('error', msError, desc);
  }
  if (!code || !state || !savedState || state !== savedState) {
    return settingsRedirect('error', 'state_mismatch');
  }

  const user = await getCurrentUser();
  const orgId = user ? primaryAgencyOrgId(user) : null;
  if (!user || !orgId || !isOrgAdmin(user, orgId)) {
    return settingsRedirect('error', 'not_admin');
  }

  const result = await exchangeCodeAndStore(orgId, user.id, code);
  if (result.ok) return settingsRedirect('connected');
  return settingsRedirect('error', result.error, result.detail);
}
