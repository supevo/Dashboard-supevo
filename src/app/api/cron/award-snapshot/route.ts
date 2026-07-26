import { NextResponse, type NextRequest } from 'next/server';
import { runMonthlyAwardSnapshot } from '@/features/awards/snapshot';
import { logger } from '@/lib/logger';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Monthly job (1st of month): freezes the previous month's awards and notifies
 * the winners. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
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
    const result = await runMonthlyAwardSnapshot();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error('cron.award_snapshot.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
