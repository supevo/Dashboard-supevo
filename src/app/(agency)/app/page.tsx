import Link from 'next/link';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getWorkStatus } from '@/features/time-tracking/queries';
import { WorkClock } from '@/features/time-tracking/components/work-clock';
import { TodayPlan } from '@/features/plan/components/today-plan';
import { PushEnableBanner } from '@/features/push/components/push-enable-banner';
import { PhilosophyBanner } from '@/features/philosophy/components/philosophy-banner';
import { listActivePhilosophyQuotes } from '@/features/philosophy/queries';
import { WeeklyChallengesCard } from '@/features/gamification/components/weekly-challenges-card';
import { getWeeklyChallenges } from '@/features/gamification/challenges';
import { getMyPulse } from '@/features/pulse/queries';
import { CoachingCard } from '@/features/coaching/components/coaching-card';
import { RemindersCard } from '@/features/reminders/components/reminders-card';
import { listMyReminders } from '@/features/reminders/queries';
import { getOverviewData } from '@/features/dashboard/overview';
import {
  HeuteCard,
  OpenQuestionsCard,
  WeekProgressCard,
  CurrentTasksCard,
} from '@/features/dashboard/components/overview-cards';
import { BoardPanel } from '@/features/tasks/components/board-panel';
import { berlinWeekday } from '@/lib/time';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

export default async function AgencyDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; modus?: string; kunde?: string }>;
}) {
  const { user, orgId } = await requireAgencyPage();
  const sp = await searchParams;
  const tab = sp.tab === 'board' ? 'board' : 'uebersicht';
  const modus = sp.modus === 'kunde' ? 'kunde' : 'persoenlich';

  const [myPulse, workStatus, philosophy] = await Promise.all([
    getMyPulse(user.id),
    getWorkStatus(user.id),
    listActivePhilosophyQuotes(orgId),
  ]);
  const weeklyPulseDue = berlinWeekday() === 5 && !myPulse;

  const tabLink = (key: 'uebersicht' | 'board', label: string) => (
    <Link
      href={key === 'board' ? '/app?tab=board' : '/app'}
      className={`rounded-md px-3.5 py-1.5 text-sm font-semibold ${
        tab === key
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PhilosophyBanner quotes={philosophy} />
      <PushEnableBanner />
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

      <div className="inline-flex rounded-lg border bg-card p-1">
        {tabLink('uebersicht', '📊 Übersicht')}
        {tabLink('board', '🗂️ Board')}
      </div>

      {tab === 'board' ? (
        <BoardPanel
          orgId={orgId}
          userId={user.id}
          modus={modus}
          kunde={sp.kunde ?? null}
        />
      ) : (
        <DashboardCards user={user} orgId={orgId} />
      )}
    </div>
  );
}

async function DashboardCards({
  user,
  orgId,
}: {
  user: { id: string };
  orgId: string;
}) {
  const [weekly, reminders, overview] = await Promise.all([
    getWeeklyChallenges(user.id, orgId),
    listMyReminders(),
    getOverviewData(user.id, orgId),
  ]);

  return (
    <>
      {/* Reihe 1: Tagesplan (breit) + Wochenchallenges. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodayPlan userId={user.id} />
        </div>
        <WeeklyChallengesCard weekly={weekly} />
      </div>

      {/* Reihe 2: Heute · Offene Rückfragen · Wochenfortschritt · Aktuelle Aufgaben. */}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <HeuteCard today={overview.today} />
        <OpenQuestionsCard questions={overview.openQuestions} />
        <WeekProgressCard week={overview.week} />
        <CurrentTasksCard tasks={overview.currentTasks} />
      </div>

      {/* Reihe 3: Erinnerungen & To-dos + KI-Feedback. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RemindersCard initialOpen={reminders.open} />
        <CoachingCard mode="me" />
      </div>
    </>
  );
}
