import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import {
  getWorkloadOverview,
  type MemberWorkload,
  type WorkloadLevel,
} from '@/features/workload/queries';
import { TeamBriefingCard } from '@/features/team-briefing/components/team-briefing-card';
import { PulseSummaryCard } from '@/features/pulse/components/pulse-summary';
import { getPulseSummary } from '@/features/pulse/queries';
import { isOrgAdmin } from '@/lib/authz/policies';
import {
  getCurrentAbsenceByUser,
  type ActiveAbsence,
} from '@/features/absences/queries';
import { formatMinutes } from '@/lib/time';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';

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

function MemberRow({
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
          <Avatar
            userId={m.userId}
            name={name}
            hasAvatar={m.hasAvatar}
            size="md"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{name}</span>
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
            </div>
            <div className="text-xs text-muted-foreground">
              {de.roles[m.role]}
            </div>
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

export default async function WorkloadPage() {
  const { user, orgId } = await requireAgencyPage();
  const admin = isOrgAdmin(user, orgId);
  const [{ members, counts }, absenceByUser, pulse] = await Promise.all([
    getWorkloadOverview(orgId),
    getCurrentAbsenceByUser(),
    admin ? getPulseSummary(orgId) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.workload.title}</h1>
        <p className="text-sm text-muted-foreground">{de.workload.subtitle}</p>
      </div>

      <TeamBriefingCard />

      {pulse && <PulseSummaryCard summary={pulse} />}

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
        <AmpelTile label={de.workload.level.idle} value={counts.idle} level="idle" />
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
                    <th className="py-2 text-center">
                      {de.workload.inProgress}
                    </th>
                    <th className="py-2 text-center">{de.workload.review}</th>
                    <th className="py-2 text-center">{de.workload.overdue}</th>
                    <th className="py-2 text-center">{de.workload.blocked}</th>
                    <th className="py-2 text-center">{de.workload.dueSoon}</th>
                    <th className="py-2 text-right">{de.workload.weekTime}</th>
                    <th className="py-2 pl-4 text-left">
                      {de.workload.status}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <MemberRow
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
    </div>
  );
}
