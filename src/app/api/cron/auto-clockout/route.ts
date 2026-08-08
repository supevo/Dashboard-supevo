import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runAutoClockout } from '@/features/time-tracking/auto-close';
import { logger } from '@/lib/logger';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Hourly job that closes forgotten clock-outs: any session whose NET working
 * time has passed the threshold is closed, credited with a normal workday and
 * the employee is notified. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  try {
    const result = await runAutoClockout();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.auto_clockout.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
