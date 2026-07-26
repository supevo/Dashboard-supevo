import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getCockpit } from '@/features/cockpit/queries';
import { CoachingCard } from '@/features/coaching/components/coaching-card';
import { formatMinutes } from '@/lib/time';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const DOT: Record<string, string> = {
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

export default async function CockpitPage() {
  const { user, orgId } = await requireAgencyPage();
  if (!isOrgAdmin(user, orgId)) redirect('/app');

  const rows = await getCockpit(orgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.cockpit.title}</h1>
        <p className="text-sm text-muted-foreground">{de.cockpit.subtitle}</p>
      </div>

      <CoachingCard mode="team" />

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{de.cockpit.empty}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.userId}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <Avatar userId={r.userId} name={r.name} hasAvatar={r.hasAvatar} size="md" />
                <div className="min-w-0 flex-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className={cn('h-2.5 w-2.5 rounded-full', DOT[r.level])} />
                    <span className="truncate">{r.name}</span>
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
      )}
    </div>
  );
}
