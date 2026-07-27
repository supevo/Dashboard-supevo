import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { listChannels, getUnreadCounts } from '@/features/messenger/queries';

/** Returns the current user's channels + unread counts for the docked chat widget. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return NextResponse.json({ channels: [], unread: {} });

  const [channels, unread] = await Promise.all([
    listChannels(orgId),
    getUnreadCounts(),
  ]);
  return NextResponse.json({ channels, unread });
}
