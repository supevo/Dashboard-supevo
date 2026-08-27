import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getAgencyDashboard } from '@/features/dashboard/queries';
import { getWorkStatus, getWeeklyWorkSummary } from '@/features/time-tracking/queries';
import { WorkClock } from '@/features/time-tracking/components/work-clock';
import { WorkHoursCard } from '@/features/time-tracking/components/work-hours-card';
import { isSuperAdmin } from '@/lib/authz/policies';
import { MorningBriefing } from '@/components/dashboard/morning-briefing';
import { TaskStatusControl } from '@/features/tasks/components/task-status-control';
import { WeeklyChallengesCard } from '@/features/gamification/components/weekly-challenges-card';
import { getWeeklyChallenges } from '@/features/gamification/challenges';
import { getMyPulse } from '@/features/pulse/queries';
import { CoachingCard } from '@/features/coaching/components/coaching-card';
import { RemindersCard } from '@/features/reminders/components/reminders-card';
import { listMyReminders } from '@/features/reminders/queries';
import { formatMinutes, formatBerlinDateTime, berlinWeekday } from '@/lib/time';
import { de } from '@/lib/i18n/de';

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default async function AgencyDashboardPage() {
  const { user, orgId } = await requireAgencyPage();
  // Everyone but the super admin sees their own weekly hours vs. target.
  const showHours = !isSuperAdmin(user);
  const [d, myPulse, workStatus, weekly, hours, reminders] = await Promise.all([
    getAgencyDashboard(user.id),
    getMyPulse(user.id),
    getWorkStatus(user.id),
    getWeeklyChallenges(user.id, orgId),
    showHours ? getWeeklyWorkSummary(user.id, orgId) : Promise.resolve(null),
    listMyReminders(),
  ]);
  // Der wöchentliche Stimmungscheck erscheint nur freitags beim Ausstempeln –
  // und nur, wenn er diese Woche noch nicht ausgefüllt wurde.
  const weeklyPulseDue = berlinWeekday() === 5 && !myPulse;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{de.nav.dashboard}</h1>
          <p className="text-muted-foreground">
            Willkommen zurück, {user.fullName ?? user.email}.
          </p>
        </div>
        <div className="w-full rounded-lg border bg-card p-3 sm:w-auto sm:min-w-[280px]">
          <WorkClock
            orgId={orgId}
            status={workStatus}
            weeklyPulseDue={weeklyPulseDue}
            pulseInitial={myPulse}
          />
        </div>
      </div>

      {/* KI-Zusammenfassung links; rechts Arbeitszeit + Wochenchallenges. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <MorningBriefing
          firstName={(user.fullName ?? '').trim().split(/\s+/)[0] ?? ''}
        />
        <div className="space-y-6">
          {hours && <WorkHoursCard summary={hours} />}
          <WeeklyChallengesCard weekly={weekly} />
        </div>
      </div>

      <CoachingCard mode="me" />

      <RemindersCard initialOpen={reminders.open} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label={de.dashboard.myActiveTasks} value={d.myActive.length} />
        <StatTile label={de.dashboard.inReview} value={d.inReviewCount} />
        <StatTile label={de.dashboard.overdue} value={d.overdueCount} />
        <StatTile label={de.dashboard.dueToday} value={d.dueTodayCount} />
        <StatTile label={de.dashboard.blocked} value={d.blockedCount} />
        <StatTile
          label={de.dashboard.openApprovals}
          value={d.openApprovalsCount}
        />
        <StatTile
          label={de.dashboard.workToday}
          value={formatMinutes(d.workTodayMinutes)}
        />
        <StatTile
          label={de.dashboard.runningTimer}
          value={d.runningTimer ? d.runningTimer.label : de.dashboard.none}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Meine Aufgaben</CardTitle>
          </CardHeader>
          <CardContent>
            {d.myActive.length === 0 ? (
              <p className="text-sm text-muted-foreground">{de.dashboard.none}</p>
            ) : (
              <ul className="divide-y">
                {d.myActive.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <Link
                      href={`/app/tasks/${t.id}`}
                      className="min-w-0 flex-1 truncate text-primary hover:underline"
                    >
                      {t.title}
                    </Link>
                    <TaskStatusControl taskId={t.id} status={t.status ?? null} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{de.dashboard.recentActivity}</CardTitle>
          </CardHeader>
          <CardContent>
            {d.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">{de.dashboard.none}</p>
            ) : (
              <ul className="divide-y">
                {d.recentActivity.map((a) => (
                  <li
                    key={a.id}
                    className="flex justify-between py-2 text-sm text-muted-foreground"
                  >
                    <span>{a.action}</span>
                    <span>{formatBerlinDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
