import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runBirthdayScheduler } from '@/features/birthday/scheduler';
import { logger } from '@/lib/logger';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Daily: grant the birthday reward (one lootbox per calendar year) to everyone
 * whose birthday is today. Idempotent, so calling more than once a day is safe.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  try {
    const result = await runBirthdayScheduler();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.birthdays.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
