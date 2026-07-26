import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { buildIcal, type IcalEvent } from '@/features/calendar/ical';

export const dynamic = 'force-dynamic';

/**
 * Public iCal feed authenticated by a secret token (?token=...). Returns the
 * organization's calendar events + approved absences as a .ics document for
 * subscribing from Google/Apple/Outlook. Read-only.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return new NextResponse('Missing token', { status: 400 });

  const service = createSupabaseServiceClient();
  const { data: feed } = await service
    .from('calendar_feed_tokens')
    .select('organization_id')
    .eq('token', token)
    .maybeSingle();
  if (!feed) return new NextResponse('Invalid token', { status: 404 });

  const orgId = feed.organization_id;

  const [{ data: events }, { data: absences }] = await Promise.all([
    service
      .from('calendar_events')
      .select('id, title, event_date, start_time, end_time, location, note')
      .eq('organization_id', orgId),
    service
      .from('absences')
      .select('id, user_id, type, start_date, end_date')
      .eq('organization_id', orgId)
      .eq('status', 'approved'),
  ]);

  const items: IcalEvent[] = [];
  for (const e of events ?? []) {
    items.push({
      uid: `evt-${e.id}@supevo`,
      date: e.event_date,
      startTime: e.start_time ? e.start_time.slice(0, 5) : null,
      endTime: e.end_time ? e.end_time.slice(0, 5) : null,
      summary: e.title,
      description: e.note,
      location: e.location,
    });
  }

  // Resolve absence owner names.
  const userIds = [...new Set((absences ?? []).map((a) => a.user_id))];
  const { data: profiles } = userIds.length
    ? await service.from('profiles').select('id, full_name').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? '—'] as const),
  );
  const typeLabel: Record<string, string> = {
    urlaub: 'Urlaub',
    krank: 'Krank',
    sonstiges: 'Abwesend',
  };
  for (const a of absences ?? []) {
    const owner = nameById.get(a.user_id) ?? '—';
    // iCal all-day DTEND is exclusive → +1 day past end_date.
    const endExclusive = new Date(`${a.end_date}T00:00:00Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    items.push({
      uid: `abs-${a.id}@supevo`,
      date: a.start_date,
      endDate: endExclusive.toISOString().slice(0, 10),
      summary: `${owner}: ${typeLabel[a.type] ?? 'Abwesend'}`,
    });
  }

  const ics = buildIcal('Supevo', items);
  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="supevo.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
