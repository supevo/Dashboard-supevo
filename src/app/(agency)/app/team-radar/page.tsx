import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Tabs, type TabDef } from '@/components/ui/tabs';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import {
  getWorkloadOverview,
  type MemberWorkload,
  type WorkloadLevel,
} from '@/features/workload/queries';
import { getCockpit } from '@/features/cockpit/queries';
import { TeamBriefingCard } from '@/features/team-briefing/components/team-briefing-card';
import { PulseSummaryCard } from '@/features/pulse/components/pulse-summary';
import { getPulseSummary } from '@/features/pulse/queries';
import {
  getCurrentAbsenceByUser,
  type ActiveAbsence,
} from '@/features/absences/queries';
import { getTeamActivity } from '@/features/team-activity/queries';
import { TeamActivityView } from '@/features/team-activity/components/team-activity-view';
import { getOptimizationSettings } from '@/features/optimization/queries';
import { OptimizationPanel } from '@/features/optimization/components/optimization-panel';
import { CoachingCard } from '@/features/coaching/components/coaching-card';
import { formatMinutes, berlinToday } from '@/lib/time';
import { LATE_EMOJI, LATE_LABEL } from '@/features/time-tracking/lateness';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const LEVEL_DOT: Record<WorkloadLevel, string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-500',
  green: 'bg-emerald-500',
  idle: 'bg-muted-foreground/40',
};

function LevelBadge({ level }: { level: WorkloadLevel }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className={cn('h-2.5 w-2.5 rounded-full', LEVEL_DOT[level])} />
      <span className="text-sm">{de.workload.level[level]}</span>
    </span>
  );
}

function AmpelTile({
  label,
  value,
  level,
}: {
  label: string;
  value: number;
  level: WorkloadLevel;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <span
        className={cn(
          'h-5 w-5 shrink-0 rounded-full ring-4',
          level === 'red' && 'bg-red-500 ring-red-500/20',
          level === 'yellow' && 'bg-amber-500 ring-amber-500/20',
          level === 'green' && 'bg-emerald-500 ring-emerald-500/20',
          level === 'idle' && 'bg-muted-foreground/40 ring-muted-foreground/10',
        )}
      />
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

/** Emphasize overdue counts so they stand out in the row. */
function Count({ value, warn }: { value: number; warn?: boolean }) {
  if (value === 0) {
    return <span className="text-muted-foreground">0</span>;
  }
  return (
    <span className={warn ? 'font-semibold text-red-600' : 'font-medium'}>
      {value}
    </span>
  );
}

function WorkloadRow({
  m,
  absence,
}: {
  m: MemberWorkload;
  absence?: ActiveAbsence;
}) {
  const name = m.fullName ?? m.email ?? '—';
  return (
    <tr className="border-b last:border-0">
      <td className="py-2">
        <div className="flex items-center gap-2">
          <Avatar userId={m.userId} name={name} hasAvatar={m.hasAvatar} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/app/team/${m.userId}`}
                className="truncate font-medium hover:text-primary hover:underline"
              >
                {name}
              </Link>
              {absence && (
                <span
                  className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700"
                  title={`${de.absence.types[absence.type]} bis ${absence.endDate
                    .split('-')
                    .reverse()
                    .join('.')}`}
                >
                  🌴 {de.absence.types[absence.type]}
                </span>
              )}
              {m.lateToday && (
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium',
                    m.lateToday === 'critical' && 'bg-red-100 text-red-700',
                    m.lateToday === 'major' && 'bg-orange-100 text-orange-700',
                    m.lateToday === 'minor' && 'bg-amber-100 text-amber-700',
                  )}
                  title={`Heute ${LATE_LABEL[m.lateToday]} eingestempelt`}
                >
                  {LATE_EMOJI[m.lateToday]} zu spät
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{de.roles[m.role]}</div>
          </div>
        </div>
      </td>
      <td className="py-2 text-center">
        <Count value={m.activeTasks} />
      </td>
      <td className="py-2 text-center">
        <Count value={m.inProgress} />
      </td>
      <td className="py-2 text-center">
        <Count value={m.review} />
      </td>
      <td className="py-2 text-center">
        <Count value={m.overdue} warn />
      </td>
      <td className="py-2 text-center">
        <Count value={m.blocked} warn />
      </td>
      <td className="py-2 text-center">
        <Count value={m.dueSoon} />
      </td>
      <td className="py-2 text-right text-muted-foreground">
        {formatMinutes(m.weekMinutes)}
      </td>
      <td className="py-2 pl-4">
        <LevelBadge level={m.level} />
      </td>
    </tr>
  );
}

const POINT_DOT: Record<string, string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-500',
  green: 'bg-emerald-500',
  idle: 'bg-muted-foreground/40',
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * Team-Radar – the single leadership view for observing the team, merging the
 * former "Cockpit" and "Auslastung" pages into one tabbed module:
 *   Auslastung · Stimmung · Aktivität · Punkte & Level.
 * Admin-only (same guard the two source pages used).
 */
export default async function TeamRadarPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; tab?: string }>;
}) {
  const { orgId } = await requireOrgAdminPage();
  const today = berlinToday();
  const sp = await searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? '') ? sp.day! : today;
  const activeTab = sp.tab ?? 'auslastung';

  const [
    { members, counts },
    absenceByUser,
    pulse,
    activity,
    optimization,
    cockpitRows,
  ] = await Promise.all([
    getWorkloadOverview(orgId),
    getCurrentAbsenceByUser(),
    getPulseSummary(orgId),
    getTeamActivity(orgId, day),
    getOptimizationSettings(orgId),
    getCockpit(orgId),
  ]);

  const tabs: TabDef[] = [
    {
      key: 'auslastung',
      label: 'Auslastung',
      content: (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">{de.workload.subtitle}</p>
            <a
              href="/app/time-import"
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              ⬆️ Stunden importieren
            </a>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <AmpelTile label={de.workload.level.red} value={counts.red} level="red" />
            <AmpelTile
              label={de.workload.level.yellow}
              value={counts.yellow}
              level="yellow"
            />
            <AmpelTile
              label={de.workload.level.green}
              value={counts.green}
              level="green"
            />
            <AmpelTile
              label={de.workload.level.idle}
              value={counts.idle}
              level="idle"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{de.workload.member}</CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">{de.workload.none}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="py-2 text-left">{de.workload.member}</th>
                        <th className="py-2 text-center">{de.workload.active}</th>
                        <th className="py-2 text-center">{de.workload.inProgress}</th>
                        <th className="py-2 text-center">{de.workload.review}</th>
                        <th className="py-2 text-center">{de.workload.overdue}</th>
                        <th className="py-2 text-center">{de.workload.blocked}</th>
                        <th className="py-2 text-center">{de.workload.dueSoon}</th>
                        <th className="py-2 text-right">{de.workload.weekTime}</th>
                        <th className="py-2 pl-4 text-left">{de.workload.status}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <WorkloadRow
                          key={m.userId}
                          m={m}
                          absence={absenceByUser.get(m.userId)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {de.workload.legend}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>🤖 KI-Arbeitsoptimierung</CardTitle>
              <p className="text-sm text-muted-foreground">
                Weist unbesetzte Aufgaben der best passenden, verfügbaren Person zu
                und entlastet Überlastete/Abwesende – per Klick oder vollautomatisch.
              </p>
            </CardHeader>
            <CardContent>
              <OptimizationPanel initial={optimization} />
            </CardContent>
          </Card>

          <TeamBriefingCard />
        </>
      ),
    },
    {
      key: 'stimmung',
      label: 'Stimmung',
      content: (
        <>
          {pulse && <PulseSummaryCard summary={pulse} />}
          <CoachingCard mode="team" />
        </>
      ),
    },
    {
      key: 'aktivitaet',
      label: 'Aktivität',
      content: (
        <TeamActivityView
          data={activity}
          maxDay={today}
          dayHrefPrefix="/app/team-radar?tab=aktivitaet&day="
        />
      ),
    },
    {
      key: 'punkte',
      label: 'Punkte & Level',
      content:
        cockpitRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{de.cockpit.empty}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {cockpitRows.map((r) => (
              <Card key={r.userId}>
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <Link href={`/app/team/${r.userId}`}>
                    <Avatar userId={r.userId} name={r.name} hasAvatar={r.hasAvatar} size="md" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span className={cn('h-2.5 w-2.5 rounded-full', POINT_DOT[r.level])} />
                      <Link
                        href={`/app/team/${r.userId}`}
                        className="truncate hover:text-primary hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.absent && <span title={de.cockpit.absent}>🌴</span>}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground">
                      ⭐ Level {r.pointLevel} · {r.points} {de.cockpit.points}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    <Metric label={de.cockpit.active} value={r.activeTasks} />
                    <Metric label={de.cockpit.overdue} value={r.overdue} />
                    <Metric label={de.cockpit.completedMonth} value={r.completedMonth} />
                    <Metric label={de.cockpit.timeWeek} value={formatMinutes(r.weekMinutes)} />
                    <Metric label={de.cockpit.okrs} value={r.activeObjectives} />
                    <Metric label={de.cockpit.okrProgress} value={`${r.avgProgress}%`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team-Radar</h1>
        <p className="text-sm text-muted-foreground">
          Auslastung, Stimmung, Aktivität und Punkte deines Teams – an einem Ort.
        </p>
      </div>
      <Tabs tabs={tabs} initialKey={activeTab} />
    </div>
  );
}
