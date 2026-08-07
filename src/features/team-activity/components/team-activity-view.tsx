import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { formatMinutes } from '@/lib/time';
import type { MemberActivity, TeamActivity, PerfTrend } from '@/features/team-activity/queries';
import { DayPicker } from '@/features/team-activity/components/day-picker';
import { cn } from '@/lib/utils';

const ABSENCE_LABEL: Record<string, string> = {
  urlaub: 'Urlaub',
  krank: 'Krank',
  sonstiges: 'Abwesend',
};

function ClockBadge({ member }: { member: MemberActivity }) {
  if (member.onAbsence)
    return (
      <span className="text-xs text-violet-600 dark:text-violet-400">
        🌴 {ABSENCE_LABEL[member.absenceType ?? ''] ?? 'Abwesend'}
      </span>
    );
  if (!member.clockedIn)
    return <span className="text-xs text-muted-foreground">⚪ nicht eingestempelt</span>;
  if (member.onBreak)
    return <span className="text-xs text-amber-600 dark:text-amber-400">⏸ Pause</span>;
  return <span className="text-xs text-emerald-600 dark:text-emerald-400">🟢 arbeitet</span>;
}

function TrendIcon({ trend }: { trend: PerfTrend }) {
  if (trend === 'up') return <span className="text-emerald-600 dark:text-emerald-400" title="mehr als letzte Woche">▲</span>;
  if (trend === 'down') return <span className="text-red-600 dark:text-red-400" title="weniger als letzte Woche">▼</span>;
  return <span className="text-muted-foreground" title="unverändert">▬</span>;
}

function NameCell({ member }: { member: MemberActivity }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar userId={member.userId} name={member.fullName ?? '—'} hasAvatar={member.hasAvatar} size="sm" />
      <span className="truncate text-sm font-medium">{member.fullName ?? 'Unbekannt'}</span>
      {member.onAbsence && (
        <span
          className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
          title="Aktuell abwesend – niedrige Werte sind dadurch erklärbar"
        >
          🌴 {ABSENCE_LABEL[member.absenceType ?? ''] ?? 'Abwesend'}
        </span>
      )}
    </div>
  );
}

/** Full team-activity view: live status, weekly completions, day timeline and a
 *  compact 30-day performance signal. Admin-only (mounted on the workload page). */
export function TeamActivityView({
  data,
  maxDay,
  dayHrefPrefix,
}: {
  data: TeamActivity;
  maxDay: string;
  /** Passed through to the DayPicker so the timeline can live under a route
   *  other than /app/workload (e.g. Team-Radar) and keep the active tab. */
  dayHrefPrefix?: string;
}) {
  const { members } = data;
  const dayLabel = new Date(`${data.day}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Teammitglieder gefunden.</p>;
  }

  return (
    <div className="space-y-6">
      {/* 1. Live */}
      <Card>
        <CardHeader>
          <CardTitle>🟢 Wer arbeitet gerade woran</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <div key={m.userId} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <NameCell member={m} />
                  <ClockBadge member={m} />
                </div>
                <div className="mt-2 text-sm">
                  {m.currentTask ? (
                    <span className="line-clamp-2">🎯 {m.currentTask}</span>
                  ) : (
                    <span className="text-muted-foreground">— keine aktive Aufgabe</span>
                  )}
                </div>
                {m.activeTaskCount > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {m.activeTaskCount} Aufgabe(n) in Arbeit
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 2. This week done */}
      <Card>
        <CardHeader>
          <CardTitle>✅ Diese Woche erledigt</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.userId} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <NameCell member={m} />
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                    {m.weekDoneCount}
                  </span>
                </div>
                {m.weekDoneTitles.length > 0 && (
                  <div className="ml-8 mt-1 flex flex-wrap gap-1">
                    {m.weekDoneTitles.map((t, i) => (
                      <span key={i} className="max-w-[220px] truncate rounded bg-muted/60 px-1.5 py-0.5 text-[11px]">
                        {t}
                      </span>
                    ))}
                    {m.weekDoneCount > m.weekDoneTitles.length && (
                      <span className="text-[11px] text-muted-foreground">
                        +{m.weekDoneCount - m.weekDoneTitles.length} weitere
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* 3. Day timeline */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>📅 Tagesverlauf</CardTitle>
            <DayPicker day={data.day} max={maxDay} hrefPrefix={dayHrefPrefix} />
          </div>
          <p className="text-sm text-muted-foreground">{dayLabel}</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Mitarbeiter</th>
                  <th className="px-3 py-2 font-medium">Erledigt</th>
                  <th className="px-3 py-2 font-medium">Zeit erfasst</th>
                  <th className="px-3 py-2 font-medium">Statuswechsel</th>
                  <th className="py-2 pl-3 font-medium">Aufgaben des Tages</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId} className="border-b align-top last:border-0">
                    <td className="py-2 pr-3"><NameCell member={m} /></td>
                    <td className="px-3 py-2 tabular-nums">{m.dayDoneCount}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMinutes(m.dayMinutes)}</td>
                    <td className="px-3 py-2 tabular-nums">{m.dayStatusChanges}</td>
                    <td className="py-2 pl-3">
                      {m.dayDoneTitles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {m.dayDoneTitles.map((t, i) => (
                            <span key={i} className="max-w-[200px] truncate rounded bg-muted/60 px-1.5 py-0.5 text-[11px]">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 4. Performance signal */}
      <Card>
        <CardHeader>
          <CardTitle>📊 Performance (letzte 30 Tage)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Mehrdimensional statt Rangliste – als Gesprächsgrundlage, nicht als Bewertung.
            Trend = diese Woche vs. letzte Woche. Abwesende (🌴 Urlaub/krank) sind
            markiert – niedrige Zahlen sind dort erwartbar.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Mitarbeiter</th>
                  <th className="px-3 py-2 font-medium">Erledigt</th>
                  <th className="px-3 py-2 font-medium">Pünktlich</th>
                  <th className="px-3 py-2 font-medium">Effizient</th>
                  <th className="px-3 py-2 font-medium">⭐ Qualität</th>
                  <th className="px-3 py-2 font-medium">Rework</th>
                  <th className="py-2 pl-3 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId} className="border-b last:border-0">
                    <td className="py-2 pr-3"><NameCell member={m} /></td>
                    <td className="px-3 py-2 tabular-nums">{m.done30}</td>
                    <td className={cn('px-3 py-2 tabular-nums', m.ontimePct !== null && m.ontimePct < 60 && 'text-amber-600 dark:text-amber-400')}>
                      {m.ontimePct !== null ? `${m.ontimePct}%` : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{m.efficientPct !== null ? `${m.efficientPct}%` : '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{m.avgStars !== null ? `${m.avgStars.toFixed(1)}` : '—'}</td>
                    <td className={cn('px-3 py-2 tabular-nums', m.rework > 0 && 'text-amber-600 dark:text-amber-400')}>{m.rework}</td>
                    <td className="py-2 pl-3"><TrendIcon trend={m.trend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
