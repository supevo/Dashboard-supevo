import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runPrintBillingReminders } from '@/features/print-billing/reminder-cron';
import { logger } from '@/lib/logger';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Täglicher Job: erinnert die zuständigen Mitarbeiter an fehlende Druckerei-
 * Rechnungen (Proforma sofort, Endrechnung ab ~10 Tagen). Vercel Cron ruft mit
 * `Authorization: Bearer $CRON_SECRET` auf.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  try {
    const result = await runPrintBillingReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.print_reminders.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
