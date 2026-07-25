import { NextResponse, type NextRequest } from 'next/server';
import { runDueApprovalReminders } from '@/features/approvals/reminder-cron';
import { logger } from '@/lib/logger';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Daily job that nudges clients about approvals left pending. Vercel Cron calls
 * this with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse(null, { status: 401 });
    }
  }

  try {
    const result = await runDueApprovalReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.approval_reminders.error', {
      error: (e as Error).message,
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
