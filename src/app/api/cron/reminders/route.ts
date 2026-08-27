import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runReminderScheduler } from '@/features/reminders/scheduler';
import { logger } from '@/lib/logger';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/** Daily: notify users about reminders that have come due. Idempotent. */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  try {
    const result = await runReminderScheduler();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.reminders.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
