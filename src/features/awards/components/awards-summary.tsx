import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { computeAwards } from '@/features/awards/engine';
import { listHallOfFame } from '@/features/awards/queries';
import { berlinToday } from '@/lib/time';
import { de } from '@/lib/i18n/de';

/**
 * Compact awards panel for the merged recognition page: shows this month's
 * hero (when known), the viewer's own live standing, and the Hall of Fame,
 * with a link to the full awards page for month-by-month detail.
 */
export async function AwardsSummary({
  orgId,
  userId,
  canSeeFull,
}: {
  orgId: string;
  userId: string;
  canSeeFull: boolean;
}) {
  const today = berlinToday();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  const [awards, hof] = await Promise.all([
    computeAwards(orgId, year, month),
    listHallOfFame(orgId, 3),
  ]);
  const myRow = awards.rows.find((r) => r.userId === userId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>{de.awards.title}</CardTitle>
          <p className="text-xs text-muted-foreground">{awards.monthLabel}</p>
        </div>
        <Link href="/app/awards" className="text-sm text-primary hover:underline">
          {de.awards.seeAll} →
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {canSeeFull && awards.overall && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-gradient-to-br from-primary/10 to-transparent p-3">
            <span className="text-2xl">🏆</span>
            <Avatar
              userId={awards.overall.userId}
              name={awards.overall.name}
              hasAvatar={awards.overall.hasAvatar}
              size="sm"
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase text-primary">
                {de.awards.employeeOfMonth}
              </div>
              <div className="truncate font-medium">{awards.overall.name}</div>
            </div>
          </div>
        )}

        {myRow && (
          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <span className="text-muted-foreground">{de.awards.myStanding}</span>
            <span className="font-semibold text-primary">{myRow.score}</span>
          </div>
        )}

        {hof.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              {de.awards.hallOfFame}
            </div>
            <ul className="space-y-1">
              {hof.map((h) => (
                <li key={`${h.year}-${h.month}`} className="flex items-center gap-2 text-sm">
                  <span>🏅</span>
                  <span className="text-muted-foreground">{h.monthLabel}:</span>
                  <span className="truncate font-medium">{h.overall.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
