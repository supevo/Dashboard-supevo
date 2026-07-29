import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runWeeklyReportReminders } from '@/features/marketing-reports/reminder-cron';
import { logger } from '@/lib/logger';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Weekly job (Fridays): nudges staff about client weekly reports that are still
 * missing for the current week. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  try {
    const result = await runWeeklyReportReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.weekly_report_reminders.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
