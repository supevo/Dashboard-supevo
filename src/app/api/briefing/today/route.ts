import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/session';
import { hasAgencyAccess } from '@/features/auth/access';
import { isAiEnabled } from '@/lib/ai/complete';
import {
  getOrCreateTodayBriefing,
  createTodayBriefing,
  currentTaskStatuses,
  type StoredBriefing,
} from '@/features/briefing/service';

export const maxDuration = 60;

/**
 * Resolves the current Kanban status of every task referenced by the briefing
 * priorities, so the overview can render a live status dropdown per priority.
 */
async function withStatuses(briefing: StoredBriefing | null) {
  const ids = (briefing?.priorities ?? [])
    .map((p) => p.taskId)
    .filter((v): v is string => !!v);
  const statuses = ids.length ? await currentTaskStatuses(ids) : {};
  return statuses;
}

async function payload(enabled: boolean, briefing: StoredBriefing | null) {
  const statuses = enabled ? await withStatuses(briefing) : {};
  return NextResponse.json({ enabled, briefing, statuses });
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
