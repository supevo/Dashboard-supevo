import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import {
  listMyAbsences,
  listTeamAbsences,
  listPendingAbsences,
  type Absence,
} from '@/features/absences/queries';
import { RequestAbsenceForm } from '@/features/absences/components/request-absence-form';
import {
  AbsenceDecide,
  AbsenceCancel,
} from '@/features/absences/components/absence-decide';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TYPE_CLASS: Record<Absence['type'], string> = {
  urlaub: 'bg-sky-100 text-sky-700',
  krank: 'bg-red-100 text-red-700',
  sonstiges: 'bg-slate-100 text-slate-700',
};
const STATUS_CLASS: Record<Absence['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-slate-100 text-slate-500',
};

function fmt(iso: string): string {
  return iso.split('-').reverse().join('.');
}

function TypeBadge({ type }: { type: Absence['type'] }) {
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-xs', TYPE_CLASS[type])}>
      {de.absence.types[type]}
    </span>
  );
}

export default async function AbsencesPage() {
  const { user, orgId } = await requireAgencyPage();
  const admin = isOrgAdmin(user, orgId);

  const [mine, team, pending] = await Promise.all([
    listMyAbsences(user.id),
    listTeamAbsences(),
    admin ? listPendingAbsences() : Promise.resolve([] as Absence[]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.absence.title}</h1>
        <p className="text-sm text-muted-foreground">{de.absence.subtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{de.absence.request}</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestAbsenceForm />
        </CardContent>
      </Card>

      {admin && (
        <Card>
          <CardHeader>
            <CardTitle>{de.absence.pending}</CardTitle>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {de.absence.noPending}
              </p>
            ) : (
              <ul className="divide-y">
                {pending.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {a.userName} <TypeBadge type={a.type} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmt(a.startDate)} – {fmt(a.endDate)}
                        {a.note ? ` · ${a.note}` : ''}
                      </div>
                    </div>
                    <AbsenceDecide id={a.id} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{de.absence.mine}</CardTitle>
          </CardHeader>
          <CardContent>
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">{de.absence.noMine}</p>
            ) : (
              <ul className="divide-y">
                {mine.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <TypeBadge type={a.type} />
                        <span>
                          {fmt(a.startDate)} – {fmt(a.endDate)}
                        </span>
                      </div>
                      {a.decisionComment && (
                        <div className="text-xs text-muted-foreground">
                          {a.decisionComment}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-xs',
                          STATUS_CLASS[a.status],
                        )}
                      >
                        {de.absence.status[a.status]}
                      </span>
                      {a.status === 'pending' && <AbsenceCancel id={a.id} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{de.absence.team}</CardTitle>
          </CardHeader>
          <CardContent>
            {team.length === 0 ? (
              <p className="text-sm text-muted-foreground">{de.absence.noTeam}</p>
            ) : (
              <ul className="divide-y">
                {team.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <TypeBadge type={a.type} />
                      {a.userName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmt(a.startDate)} – {fmt(a.endDate)}
                    </span>
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
