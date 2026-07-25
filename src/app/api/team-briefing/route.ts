import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess, primaryAgencyOrgId } from '@/features/auth/access';
import { isAiEnabled } from '@/lib/ai/complete';
import { berlinToday } from '@/lib/time';
import { gatherTeamContext } from '@/features/team-briefing/context';
import {
  generateTeamBriefing,
  type TeamBriefing,
} from '@/features/team-briefing/generate';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Best-effort in-memory cache (per org, per day) to avoid regenerating on every
// page view within a warm serverless instance. POST bypasses it.
const cache = new Map<string, { date: string; briefing: TeamBriefing | null }>();

async function build(orgId: string, force: boolean) {
  const today = berlinToday();
  if (!force) {
    const hit = cache.get(orgId);
    if (hit && hit.date === today) return hit.briefing;
  }
  const ctx = await gatherTeamContext(orgId);
  const briefing = await generateTeamBriefing(ctx);
  cache.set(orgId, { date: today, briefing });
  return briefing;
}

async function handle(force: boolean) {
  const user = await getCurrentUser();
  if (!user || !hasAgencyAccess(user)) {
    return new NextResponse(null, { status: 401 });
  }
  const orgId = primaryAgencyOrgId(user);
  if (!orgId) return NextResponse.json({ enabled: false, briefing: null });
  if (!isAiEnabled()) return NextResponse.json({ enabled: false, briefing: null });

  const briefing = await build(orgId, force);
  return NextResponse.json({ enabled: true, briefing });
}

export async function GET() {
  return handle(false);
}

export async function POST() {
  return handle(true);
}
