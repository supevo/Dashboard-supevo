import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runPlanScheduler } from '@/features/marketing-plan/embed';
import { logger } from '@/lib/logger';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Monthly job: for every accepted marketing plan, embeds the measures that are
 * due this month (and not yet embedded) into the client's board. So the team
 * always has the planned work queued without manual "übernehmen".
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  try {
    const result = await runPlanScheduler();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.plan_scheduler.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
