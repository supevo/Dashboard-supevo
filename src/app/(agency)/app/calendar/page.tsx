import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getCalendarData } from '@/features/calendar/queries';
import { listClientCompanies } from '@/features/client-companies/queries';
import { NewEventButton } from '@/features/calendar/components/new-event-button';
import { EventList } from '@/features/calendar/components/event-list';
import { berlinToday } from '@/lib/time';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { orgId } = await requireAgencyPage();
  const { month: monthParam } = await searchParams;

  const today = berlinToday();
  const m = /^(\d{4})-(\d{2})$/.exec(monthParam ?? '');
  const year = m ? Number(m[1]) : Number(today.slice(0, 4));
  const month = m ? Number(m[2]) : Number(today.slice(5, 7)); // 1-12

  // Grid spans full weeks (Mon–Sun) covering the month.
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startOffset = (first.getUTCDay() + 6) % 7; // Mon=0
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - startOffset);
  const last = new Date(Date.UTC(year, month, 0));
  const endOffset = (last.getUTCDay() + 6) % 7;
  const gridEnd = new Date(last);
  gridEnd.setUTCDate(last.getUTCDate() + (6 - endOffset));

  const [data, clients] = await Promise.all([
    getCalendarData(iso(gridStart), iso(gridEnd)),
    listClientCompanies(orgId),
  ]);

  // Group entries by date.
  const byDate = new Map<
    string,
    { events: typeof data.events; absences: typeof data.absences; deadlines: typeof data.deadlines }
  >();
  const bucket = (d: string) => {
    let b = byDate.get(d);
    if (!b) {
      b = { events: [], absences: [], deadlines: [] };
      byDate.set(d, b);
    }
    return b;
  };
  data.events.forEach((e) => bucket(e.date).events.push(e));
  data.absences.forEach((a) => bucket(a.date).absences.push(a));
  data.deadlines.forEach((dl) => bucket(dl.date).deadlines.push(dl));

  // Build the day cells.
  const days: Date[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(new Date(d));
  }

  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthEvents = data.events.filter((e) => e.date.startsWith(monthPrefix));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{de.calendar.title}</h1>
          <p className="text-sm text-muted-foreground">{de.calendar.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/calendar?month=${prev}`}
            className="rounded-md border px-2 py-1.5 text-sm hover:bg-muted"
          >
            ←
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-medium">
            {MONTHS[month - 1]} {year}
          </span>
          <Link
            href={`/app/calendar?month=${next}`}
            className="rounded-md border px-2 py-1.5 text-sm hover:bg-muted"
          >
            →
          </Link>
          <NewEventButton clients={clients.map((c) => ({ id: c.id, name: c.name }))} defaultDate={`${year}-${String(month).padStart(2, '0')}-01`} />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-2 sm:p-4">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const key = iso(d);
                const inMonth = d.getUTCMonth() === month - 1;
                const isToday = key === today;
                const b = byDate.get(key);
                return (
                  <div
                    key={key}
                    className={cn(
                      'min-h-[92px] rounded-md border p-1 text-left align-top',
                      inMonth ? 'bg-card' : 'bg-muted/30 text-muted-foreground',
                      isToday && 'border-primary ring-1 ring-primary',
                    )}
                  >
                    <div className="mb-1 text-xs font-medium">
                      {d.getUTCDate()}
                    </div>
                    <div className="space-y-0.5">
                      {b?.events.map((e) => (
                        <div
                          key={e.id}
                          className="truncate rounded bg-sky-100 px-1 text-[10px] text-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                          title={`${e.title}${e.clientName ? ` · ${e.clientName}` : ''}`}
                        >
                          {e.startTime ? `${e.startTime} ` : ''}
                          {e.title}
                        </div>
                      ))}
                      {b?.absences.map((a) => (
                        <div
                          key={a.id}
                          className="truncate rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                          title={`${a.userName} · ${de.absence.types[a.type]}`}
                        >
                          🌴 {a.userName}
                        </div>
                      ))}
                      {b?.deadlines.slice(0, 3).map((dl) => (
                        <div
                          key={dl.id}
                          className="truncate rounded bg-slate-100 px-1 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          title={`${dl.title} · ${dl.projectName}`}
                        >
                          📅 {dl.title}
                        </div>
                      ))}
                      {b && b.deadlines.length > 3 && (
                        <div className="px-1 text-[10px] text-muted-foreground">
                          +{b.deadlines.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span>🟦 {de.calendar.legendEvent}</span>
            <span>🟨 {de.calendar.legendAbsence}</span>
            <span>📅 {de.calendar.legendDeadline}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {de.calendar.eventsIn} {MONTHS[month - 1]} {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EventList events={monthEvents} />
        </CardContent>
      </Card>
    </div>
  );
}
