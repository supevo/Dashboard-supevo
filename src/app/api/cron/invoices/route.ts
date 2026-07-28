import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runDueInvoices } from '@/features/billing/cron-run';
import { logger } from '@/lib/logger';

// Billing generation may render several PDFs; allow more time.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Daily billing job. Vercel Cron calls this with `Authorization: Bearer
 * $CRON_SECRET` (set the CRON_SECRET env var). Generates invoices for all
 * memberships due today and — when auto-send is enabled — emails the PDFs.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  try {
    const result = await runDueInvoices();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.invoices.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
