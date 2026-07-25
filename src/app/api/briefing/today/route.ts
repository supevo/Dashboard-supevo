import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { isAiEnabled } from '@/lib/ai/anthropic';
import {
  getOrCreateTodayBriefing,
  createTodayBriefing,
  type StoredBriefing,
} from '@/features/briefing/service';

export const maxDuration = 60;

function payload(enabled: boolean, briefing: StoredBriefing | null) {
  return NextResponse.json({ enabled, briefing });
}

/** Returns today's briefing, generating it on first request. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  if (!isAiEnabled()) return payload(false, null);

  const briefing = await getOrCreateTodayBriefing(user.id);
  return payload(true, briefing);
}

/** Forces regeneration of today's briefing (refresh button). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  if (!isAiEnabled()) return payload(false, null);

  const briefing = await createTodayBriefing(user.id);
  return payload(true, briefing);
}
