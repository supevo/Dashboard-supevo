import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import {
  getWorkStatus,
  getRunningTimer,
  getMyTimeSummary,
} from '@/features/time-tracking/queries';
import { listProjects } from '@/features/projects/queries';
import { WorkClock } from '@/features/time-tracking/components/work-clock';
import { TimerStop } from '@/features/time-tracking/components/timer-stop';
import { ManualEntryForm } from '@/features/time-tracking/components/manual-entry-form';
import { TimeEntryRow } from '@/features/time-tracking/components/time-entry-row';
import { startOfBerlinDayUtc, formatMinutes } from '@/lib/time';
import { de } from '@/lib/i18n/de';

export default async function TimePage() {
  const { user, orgId } = await requireAgencyPage();

  const weekSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [status, timer, today, week, projects] = await Promise.all([
    getWorkStatus(user.id),
    getRunningTimer(user.id),
    getMyTimeSummary(user.id, startOfBerlinDayUtc()),
    getMyTimeSummary(user.id, weekSince),
    listProjects(orgId),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.time.title}</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{de.time.workTime}</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkClock orgId={orgId} status={status} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{de.time.runningTimer}</CardTitle>
          </CardHeader>
          <CardContent>
            <TimerStop timer={timer} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{de.time.manualEntry}</CardTitle>
        </CardHeader>
        <CardContent>
          <ManualEntryForm
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.time.myEntries}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              {de.time.today}:{' '}
              <span className="font-medium">
                {formatMinutes(today.totalMinutes)}
              </span>
            </span>
            <span>
              {de.time.thisWeek}:{' '}
              <span className="font-medium">
                {formatMinutes(week.totalMinutes)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {de.time.billableTotal}: {formatMinutes(week.billableMinutes)} ·{' '}
              {de.time.nonBillableTotal}:{' '}
              {formatMinutes(week.nonBillableMinutes)}
            </span>
          </div>
          {week.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{de.time.noEntries}</p>
          ) : (
            <ul className="divide-y">
              {week.entries.map((e) => (
                <TimeEntryRow
                  key={e.id}
                  entry={e}
                  projectName={projectName.get(e.projectId) ?? '—'}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
