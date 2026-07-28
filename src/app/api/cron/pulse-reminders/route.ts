import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runPulseReminders } from '@/features/pulse/reminder-cron';
import { logger } from '@/lib/logger';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Weekly job (Fridays): nudges staff who have not submitted their pulse check.
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  try {
    const result = await runPulseReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.pulse_reminders.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
