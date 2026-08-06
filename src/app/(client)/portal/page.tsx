import { requireClientPage } from '@/lib/authz/page-guards';
import { getClientDashboard } from '@/features/dashboard/queries';
import { getMyClientCompany, getMySatisfaction } from '@/features/satisfaction/queries';
import { SatisfactionWidget } from '@/features/satisfaction/components/satisfaction-widget';
import { getClientNews } from '@/features/news/service';
import { NewsTicker } from '@/features/news/components/news-ticker';
import { getMyOnboarding } from '@/features/onboarding/queries';
import { OnboardingStepper } from '@/features/onboarding/components/onboarding-stepper';
import { getClientWeekWork } from '@/features/recap/client-week';
import { WeekWorkCard } from '@/features/recap/components/week-work-card';
import { getMyAccountManagers } from '@/features/account-manager/queries';
import { AccountManagersCard } from '@/features/account-manager/components/account-managers-card';
import { ClientStatTiles } from '@/features/dashboard/components/client-stat-tiles';
import { de } from '@/lib/i18n/de';

export default async function ClientDashboardPage() {
  const { user } = await requireClientPage();
  const [d, company] = await Promise.all([
    getClientDashboard(),
    getMyClientCompany(),
  ]);
  const [mySatisfaction, news, onboarding, weekWork, accountManagers] =
    await Promise.all([
      company ? getMySatisfaction(company.clientCompanyId) : Promise.resolve(null),
      company
        ? getClientNews(company.clientCompanyId, company.organizationId)
        : Promise.resolve(null),
      getMyOnboarding(),
      getClientWeekWork(),
      getMyAccountManagers(),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Willkommen</h1>
        <p className="text-muted-foreground">
          Schön, dass Sie da sind, {user.fullName ?? user.email}.
        </p>
      </div>

      {accountManagers.primary && (
        <AccountManagersCard
          primary={accountManagers.primary}
          secondary={accountManagers.secondary}
        />
      )}

      {onboarding && onboarding.started && !onboarding.complete && (
        <OnboardingStepper status={onboarding} />
      )}

      <ClientStatTiles
        tiles={[
          { key: 'open', label: de.dashboard.open, tasks: d.openTasks },
          { key: 'inProgress', label: de.dashboard.inProgress, tasks: d.inProgressTasks },
          { key: 'toApprove', label: de.dashboard.toApprove, tasks: d.toApproveTasks },
        ]}
      />

      {news && news.items.length > 0 ? (
        <NewsTicker items={news.items} topic={news.topic} />
      ) : null}

      {company ? <SatisfactionWidget initial={mySatisfaction} /> : null}

      <WeekWorkCard data={weekWork} />
    </div>
  );
}
