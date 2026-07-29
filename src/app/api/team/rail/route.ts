import { NextResponse } from 'next/server';
import { getTeamRail } from '@/features/presence/team-rail';

export const dynamic = 'force-dynamic';

/** Live data for the team rail (presence + current/last activity). Polled. */
export async function GET() {
  const data = await getTeamRail();
  if (!data) return new NextResponse(null, { status: 403 });
  return NextResponse.json(data);
}
