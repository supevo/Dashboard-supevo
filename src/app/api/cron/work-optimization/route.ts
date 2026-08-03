import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runOptimizationScheduler } from '@/features/optimization/scheduler';
import { logger } from '@/lib/logger';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Runs the KI work-optimization for every org whose automatic mode is on and
 * whose cadence is due. Vercel Cron calls this with the CRON_SECRET; the
 * scheduler enforces the per-org interval, so calling more often is harmless.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  try {
    const result = await runOptimizationScheduler();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.work_optimization.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
