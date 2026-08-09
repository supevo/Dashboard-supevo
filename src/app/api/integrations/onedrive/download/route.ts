import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { primaryAgencyOrgId, hasAgencyAccess } from '@/features/auth/access';
import { getDownloadUrl } from '@/lib/onedrive/graph';

/**
 * Redirects to a OneDrive item's short-lived direct download URL (agency staff).
 * The bytes flow straight from Microsoft to the browser – nothing is proxied
 * through our server, so this costs no bandwidth/CPU on our side. The org's
 * connection token scopes access to that org's drive.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });

  const itemId = request.nextUrl.searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'no_item' }, { status: 400 });

  const dl = await getDownloadUrl(orgId, itemId);
  if (!dl) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.redirect(dl.url);
}
