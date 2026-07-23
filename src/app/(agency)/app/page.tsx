import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getAgencyDashboard } from '@/features/dashboard/queries';
import { formatMinutes, formatBerlinDateTime } from '@/lib/time';
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
  const { user } = await requireAgencyPage();
  const d = await getAgencyDashboard(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.nav.dashboard}</h1>
        <p className="text-muted-foreground">
          Willkommen zurück, {user.fullName ?? user.email}.
        </p>
      </div>

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
            <CardTitle>{de.dashboard.myActiveTasks}</CardTitle>
          </CardHeader>
          <CardContent>
            {d.myActive.length === 0 ? (
              <p className="text-sm text-muted-foreground">{de.dashboard.none}</p>
            ) : (
              <ul className="divide-y">
                {d.myActive.map((t) => (
                  <li key={t.id} className="py-2 text-sm">
                    <Link
                      href={`/app/tasks/${t.id}`}
                      className="text-primary hover:underline"
                    >
                      {t.title}
                    </Link>
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
