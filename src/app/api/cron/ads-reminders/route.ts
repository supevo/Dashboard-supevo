import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runAdsBillingReminders } from '@/features/ads-billing/reminder-cron';
import { logger } from '@/lib/logger';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Täglicher Job: erinnert die Verantwortlichen an offene Ads-Abrechnungen
 * (Verbrauch des Vormonats eintragen / Monat abrechnen). Vercel Cron ruft mit
 * `Authorization: Bearer $CRON_SECRET` auf.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  try {
    const result = await runAdsBillingReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.ads_reminders.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
