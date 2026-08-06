import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/features/auth/session';
import { primaryAgencyOrgId } from '@/features/auth/access';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getOneDriveConfig, authorizeUrl } from '@/lib/onedrive/config';

const STATE_COOKIE = 'od_oauth_state';

/** Starts the OneDrive OAuth flow (org admin only). */
export async function GET(_request: NextRequest) {
  const config = getOneDriveConfig();
  if (!config) {
    return NextResponse.json({ error: 'not_configured' }, { status: 404 });
  }
  const user = await getCurrentUser();
  const orgId = user ? primaryAgencyOrgId(user) : null;
  if (!user || !orgId || !isOrgAdmin(user, orgId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const state = randomUUID();
  const res = NextResponse.redirect(authorizeUrl(config, state));
  // Short-lived CSRF guard: the callback must present the same state.
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
