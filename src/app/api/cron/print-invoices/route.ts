import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runMonthlyPrintInvoices } from '@/features/print-billing/print-invoice-run';
import { logger } from '@/lib/logger';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Monatlicher Job (Vercel Cron, 1. des Monats): erzeugt die Sammel-Ausgangs-
 * rechnungen für Druckprodukte des Vormonats als ENTWURF pro Kunde und
 * benachrichtigt die Org-Admins zum Prüfen/Senden. Auth via
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  try {
    const result = await runMonthlyPrintInvoices();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.print_invoices.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
