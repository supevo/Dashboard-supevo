import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { getRunningTimer } from '@/features/time-tracking/queries';

export const dynamic = 'force-dynamic';

/** Returns the current user's running task timer (or null). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const timer = await getRunningTimer(user.id);
  return NextResponse.json({ timer });
}
