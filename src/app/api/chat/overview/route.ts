import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { listChannels } from '@/features/messenger/queries';

/** Returns the current user's channels for the docked chat widget. Agency only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return NextResponse.json({ channels: [] });

  const channels = await listChannels(orgId);
  return NextResponse.json({ channels });
}
