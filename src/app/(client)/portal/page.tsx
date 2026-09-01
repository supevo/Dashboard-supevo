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
import { getClientWeekWork } from '@/features/recap/client-week';
import { WeekWorkCard } from '@/features/recap/components/week-work-card';
import { getMyAccountManagers } from '@/features/account-manager/queries';
import { AccountManagersCard } from '@/features/account-manager/components/account-managers-card';
import { ClientStatTiles } from '@/features/dashboard/components/client-stat-tiles';
import { getMyPortalTourSeen } from '@/features/onboarding/portal-tour-queries';
import {
  PortalTour,
  TourReplayButton,
} from '@/features/onboarding/components/portal-tour';
import { de } from '@/lib/i18n/de';

export default async function ClientDashboardPage() {
  const { user } = await requireClientPage();
  const [d, company] = await Promise.all([
    getClientDashboard(),
    getMyClientCompany(),
  ]);
  const [mySatisfaction, news, onboarding, weekWork, accountManagers, tourSeen] =
    await Promise.all([
      company ? getMySatisfaction(company.clientCompanyId) : Promise.resolve(null),
      company
        ? getClientNews(company.clientCompanyId, company.organizationId)
        : Promise.resolve(null),
      getMyOnboarding(),
      getClientWeekWork(),
      getMyAccountManagers(),
      getMyPortalTourSeen(),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Willkommen</h1>
          <p className="text-muted-foreground">
            Schön, dass Sie da sind, {user.fullName ?? user.email}.
          </p>
        </div>
        <TourReplayButton />
      </div>

      {accountManagers.primary && (
        <div data-tour="account-managers">
          <AccountManagersCard
            primary={accountManagers.primary}
            secondary={accountManagers.secondary}
          />
        </div>
      )}

      {onboarding && onboarding.started && !onboarding.complete && (
        <div data-tour="onboarding">
          <OnboardingStepper status={onboarding} />
        </div>
      )}

      {company ? (
        <div data-tour="assets">
          <Card>
            <CardHeader>
              <CardTitle>🔑 Zugänge &amp; Logos hinterlegen</CardTitle>
              <p className="text-sm text-muted-foreground">
                Damit wir direkt loslegen können: Hinterlegen Sie Ihre Login-Daten
                (verschlüsselt, nur für Ihr Team sichtbar) und laden Sie Ihre
                Logos &amp; Marken-Dateien hoch.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/portal/access"
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  🔑 Zugänge hinzufügen
                </Link>
                <Link
                  href="/portal/hub"
                  className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  🎨 Logos hochladen
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Aufgaben-Übersicht (offen/Bearbeitung/Freigabe) ist ein supevo-Flow –
          Legacy-Kunden haben ihn nicht, daher hier ausgeblendet. */}
      {!company?.isLegacy && (
        <div data-tour="tasks">
          <ClientStatTiles
            tiles={[
              { key: 'open', label: de.dashboard.open, tasks: d.openTasks },
              { key: 'inProgress', label: de.dashboard.inProgress, tasks: d.inProgressTasks },
              { key: 'toApprove', label: de.dashboard.toApprove, tasks: d.toApproveTasks },
            ]}
          />
        </div>
      )}

      <div data-tour="week">
        <WeekWorkCard data={weekWork} />
      </div>

      {news && news.items.length > 0 ? (
        <div data-tour="news">
          <NewsTicker items={news.items} topic={news.topic} />
        </div>
      ) : null}

      {company ? (
        <div data-tour="satisfaction">
          <SatisfactionWidget initial={mySatisfaction} />
        </div>
      ) : null}

      <PortalTour autoStart={!tourSeen} />
    </div>
  );
}
