import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { getClientDashboard } from '@/features/dashboard/queries';
import { getMyClientCompany, getMySatisfaction } from '@/features/satisfaction/queries';
import { SatisfactionWidget } from '@/features/satisfaction/components/satisfaction-widget';
import { getClientNews } from '@/features/news/service';
import { NewsTicker } from '@/features/news/components/news-ticker';
import { getMyOnboarding } from '@/features/onboarding/queries';
import { OnboardingStepper } from '@/features/onboarding/components/onboarding-stepper';
import { de } from '@/lib/i18n/de';

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default async function ClientDashboardPage() {
  const { user } = await requireClientPage();
  const d = await getClientDashboard();
  const company = await getMyClientCompany();
  const mySatisfaction = company
    ? await getMySatisfaction(company.clientCompanyId)
    : null;
  const news = company
    ? await getClientNews(company.clientCompanyId, company.organizationId)
    : null;
  const onboarding = await getMyOnboarding();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Willkommen</h1>
        <p className="text-muted-foreground">
          Schön, dass Sie da sind, {user.fullName ?? user.email}.
        </p>
      </div>

      {onboarding && onboarding.started && !onboarding.complete && (
        <OnboardingStepper status={onboarding} />
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label={de.dashboard.open} value={d.openCount} />
        <StatTile label={de.dashboard.inProgress} value={d.inProgressCount} />
        <StatTile label={de.dashboard.toApprove} value={d.toApproveCount} />
      </div>

      {news && news.items.length > 0 ? (
        <NewsTicker items={news.items} topic={news.topic} />
      ) : null}

      {company ? <SatisfactionWidget initial={mySatisfaction} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{de.dashboard.completed}</CardTitle>
        </CardHeader>
        <CardContent>
          {d.completedRecent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{de.dashboard.none}</p>
          ) : (
            <ul className="divide-y">
              {d.completedRecent.map((t) => (
                <li key={t.id} className="py-2 text-sm">
                  <Link
                    href={`/portal/tasks/${t.id}`}
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
    </div>
  );
}
