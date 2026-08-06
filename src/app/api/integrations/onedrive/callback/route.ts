import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getOneDriveConfig } from '@/lib/onedrive/config';
import { exchangeCodeAndStore } from '@/lib/onedrive/graph';
import { env } from '@/lib/env';

const STATE_COOKIE = 'od_oauth_state';

function settingsRedirect(status: string): NextResponse {
  const url = new URL('/app/settings', env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set('onedrive', status);
  url.hash = 'onedrive';
  const res = NextResponse.redirect(url.toString());
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/** OAuth callback: exchanges the code and stores the encrypted refresh token. */
export async function GET(request: NextRequest) {
  if (!getOneDriveConfig()) return settingsRedirect('error');

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const savedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !savedState || state !== savedState) {
    return settingsRedirect('error');
  }

  const user = await getCurrentUser();
  const orgId = user ? primaryAgencyOrgId(user) : null;
  if (!user || !orgId || !isOrgAdmin(user, orgId)) {
    return settingsRedirect('error');
  }

  const result = await exchangeCodeAndStore(orgId, user.id, code);
  if (result.ok) return settingsRedirect('connected');
  return settingsRedirect(result.error === 'store_failed' ? 'store_error' : 'error');
}
