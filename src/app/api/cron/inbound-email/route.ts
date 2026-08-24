import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { processInboundEmails } from '@/features/inquiries/inbound-process';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
// IMAP-Abruf + KI-Parsing kann etwas dauern.
export const maxDuration = 120;

/**
 * Cron: holt neue Anfragen-Mails aus dem Catch-all-Postfach und legt sie ab.
 * Läuft alle paar Minuten (siehe vercel.json). No-op, solange IMAP/INBOUND_DOMAIN
 * nicht konfiguriert sind.
 */
export async function GET(request: NextRequest) {
  const unauthorized = cronUnauthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await processInboundEmails();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.inbound_email.failed', { error: (e as Error).message });
    return NextResponse.json({ ok: false, error: 'inbound failed' }, { status: 500 });
  }
}
