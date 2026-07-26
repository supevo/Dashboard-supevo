import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { computeAwards, type AwardWinner } from '@/features/awards/engine';
import { berlinToday } from '@/lib/time';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

function AwardCard({
  title,
  emoji,
  winner,
}: {
  title: string;
  emoji: string;
  winner: AwardWinner | null;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="text-3xl">{emoji}</span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </div>
          {winner ? (
            <>
              <div className="flex items-center gap-2">
                <Avatar userId={winner.userId} name={winner.name} hasAvatar={winner.hasAvatar} size="sm" />
                <span className="truncate font-medium">{winner.name}</span>
              </div>
              <div className="text-xs text-muted-foreground">{winner.value}</div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AwardsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { orgId } = await requireAgencyPage();
  const { month: monthParam } = await searchParams;
  const today = berlinToday();
  const m = /^(\d{4})-(\d{2})$/.exec(monthParam ?? '');
  const year = m ? Number(m[1]) : Number(today.slice(0, 4));
  const month = m ? Number(m[2]) : Number(today.slice(5, 7));

  const awards = await computeAwards(orgId, year, month);

  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{de.awards.title}</h1>
          <p className="text-sm text-muted-foreground">{de.awards.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/app/awards?month=${prev}`} className="rounded-md border px-2 py-1.5 text-sm hover:bg-muted">←</Link>
          <span className="min-w-[9rem] text-center text-sm font-medium">{awards.monthLabel}</span>
          <Link href={`/app/awards?month=${next}`} className="rounded-md border px-2 py-1.5 text-sm hover:bg-muted">→</Link>
        </div>
      </div>

      {/* Employee of the month hero */}
      <Card className="border-primary/40 bg-gradient-to-br from-primary/10 to-transparent">
        <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
          <div className="text-4xl">🏆</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">
            {de.awards.employeeOfMonth}
          </div>
          {awards.overall ? (
            <>
              <Avatar userId={awards.overall.userId} name={awards.overall.name} hasAvatar={awards.overall.hasAvatar} size="lg" />
              <div className="text-xl font-bold">{awards.overall.name}</div>
              <div className="text-sm text-muted-foreground">{awards.overall.value}</div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">{de.awards.noWinner}</div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <AwardCard title={de.awards.quality} emoji="✨" winner={awards.quality} />
        <AwardCard title={de.awards.reliability} emoji="🎯" winner={awards.reliability} />
        <AwardCard title={de.awards.team} emoji="🤝" winner={awards.team} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{de.awards.leaderboard}</CardTitle>
          <p className="text-xs text-muted-foreground">{de.awards.formulaHint}</p>
        </CardHeader>
        <CardContent>
          {awards.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{de.awards.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left">{de.awards.member}</th>
                    <th className="py-2 text-right">{de.awards.score}</th>
                    <th className="py-2 text-right">{de.awards.completed}</th>
                    <th className="py-2 text-right">{de.awards.avgStars}</th>
                    <th className="py-2 text-right">{de.awards.onTime}</th>
                    <th className="py-2 text-right">{de.awards.kudos}</th>
                  </tr>
                </thead>
                <tbody>
                  {awards.rows.map((r, i) => (
                    <tr key={r.userId} className="border-b last:border-0">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
                          <Avatar userId={r.userId} name={r.name} hasAvatar={r.hasAvatar} size="sm" />
                          <span className="truncate">{r.name}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right font-semibold">{r.score}</td>
                      <td className="py-2 text-right text-muted-foreground">{r.completed}</td>
                      <td className="py-2 text-right text-muted-foreground">{r.avgStars ?? '—'}</td>
                      <td className="py-2 text-right text-muted-foreground">{r.onTimeRate !== null ? `${r.onTimeRate}%` : '—'}</td>
                      <td className="py-2 text-right text-muted-foreground">{r.kudos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
