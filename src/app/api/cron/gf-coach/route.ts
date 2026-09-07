import { NextResponse, type NextRequest } from 'next/server';
import { cronUnauthorized } from '@/lib/cron-auth';
import { runGfCoachMorning, runGfCoachEvening } from '@/features/ceo/coach-scheduler';
import { logger } from '@/lib/logger';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * GF-Coach-Trigger. Wird mehrfach angesteuert (07/08 UTC = 09:00 Berlin,
 * 16/17 UTC = 18:00 Berlin), damit die lokale Uhrzeit ganzjährig (Sommer-/
 * Winterzeit) exakt passt – ausgeführt wird nur zur passenden Berlin-Stunde.
 * Morgens: Tag automatisch planen + anstupsen. Abends: Feierabend-Check.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '-1');
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const isWeekday = !['Sat', 'Sun'].includes(weekday);

  try {
    if (isWeekday && hour === 9) {
      const result = await runGfCoachMorning();
      return NextResponse.json({ ok: true, phase: 'morning', ...result });
    }
    if (isWeekday && hour === 18) {
      const result = await runGfCoachEvening();
      return NextResponse.json({ ok: true, phase: 'evening', ...result });
    }
    return NextResponse.json({ ok: true, skipped: true, hour, weekday });
  } catch (e) {
    logger.error('cron.gf_coach.error', { error: (e as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
