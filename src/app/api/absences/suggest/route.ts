import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { suggestVacation } from '@/features/absences/suggest';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Returns an AI/heuristic vacation-window suggestion for the current user. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return NextResponse.json({ suggestion: null });

  const suggestion = await suggestVacation(user.id, orgId);
  return NextResponse.json({ suggestion });
}
