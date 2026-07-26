import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { computeAwards, type AwardWinner, type PersonScore } from '@/features/awards/engine';
import { listHallOfFame } from '@/features/awards/queries';
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

/** Shifts a year/month by a number of months (negative = past). */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export default async function AwardsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { user, orgId } = await requireAgencyPage();
  const { month: monthParam } = await searchParams;
  const today = berlinToday();
  const curYear = Number(today.slice(0, 4));
  const curMonth = Number(today.slice(5, 7));
  const m = /^(\d{4})-(\d{2})$/.exec(monthParam ?? '');
  const year = m ? Number(m[1]) : curYear;
  const month = m ? Number(m[2]) : curMonth;

  const awards = await computeAwards(orgId, year, month);

  // Visibility model (Hybrid): the full ranking + winners are only revealed
  // once a month is finished. During the running month each employee sees only
  // their own live standing. Org admins always see everything.
  const admin = isOrgAdmin(user, orgId);
  const viewedIsComplete = year * 12 + month < curYear * 12 + curMonth;
  const isCurrentMonth = year === curYear && month === curMonth;
  const canSeeFull = admin || viewedIsComplete;

  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;

  // Hall of Fame: prefer the frozen snapshots (stable). Before any snapshot
  // exists (feature just shipped), fall back to a live computation of the last
  // completed months so the section is not empty.
  const snapshots = await listHallOfFame(orgId, 6);
  let hof: { monthLabel: string; overall: AwardWinner }[] = snapshots.map((s) => ({
    monthLabel: s.monthLabel,
    overall: s.overall,
  }));
  if (hof.length === 0) {
    const hofMonths = [1, 2, 3].map((d) => shiftMonth(curYear, curMonth, -d));
    const hofResults = await Promise.all(
      hofMonths.map((h) => computeAwards(orgId, h.year, h.month)),
    );
    hof = hofResults
      .map((a) => ({ monthLabel: a.monthLabel, overall: a.overall }))
      .filter((h): h is { monthLabel: string; overall: AwardWinner } => h.overall !== null);
  }

  const myRow: PersonScore | undefined = awards.rows.find((r) => r.userId === user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{de.awards.title}</h1>
          <p className="text-sm text-muted-foreground">{de.awards.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/app/awards?month=${prev}`} className="rounded-md border px-2 py-1.5 text-sm hover:bg-muted">←</Link>
          <span className="min-w-[9rem] text-center text-sm font-medium">
            {awards.monthLabel}
            {isCurrentMonth ? <span className="ml-1 text-xs text-muted-foreground">({de.awards.ongoing})</span> : null}
          </span>
          <Link href={`/app/awards?month=${next}`} className="rounded-md border px-2 py-1.5 text-sm hover:bg-muted">→</Link>
        </div>
      </div>

      {canSeeFull ? (
        <>
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
                        <tr
                          key={r.userId}
                          className={`border-b last:border-0 ${r.userId === user.id ? 'bg-primary/5' : ''}`}
                        >
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
        </>
      ) : (
        <>
          {/* Employee view of the running month: only your own live standing. */}
          <Card className="border-primary/40 bg-gradient-to-br from-primary/10 to-transparent">
            <CardHeader>
              <CardTitle>{de.awards.myStanding}</CardTitle>
              <p className="text-xs text-muted-foreground">{de.awards.revealHint}</p>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-col items-center gap-1 text-center">
                <Avatar userId={user.id} name={user.fullName ?? user.email} hasAvatar={false} size="lg" />
                <div className="text-3xl font-bold">{myRow?.score ?? 0}</div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{de.awards.yourScore}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border p-3 text-center">
                  <div className="text-lg font-semibold">{myRow?.completed ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{de.awards.completed}</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-lg font-semibold">{myRow?.avgStars ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{de.awards.avgStars}</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-lg font-semibold">
                    {myRow && myRow.onTimeRate !== null ? `${myRow.onTimeRate}%` : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground">{de.awards.onTime}</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-lg font-semibold">{myRow?.kudos ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{de.awards.kudos}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Hall of Fame — always visible. */}
      <Card>
        <CardHeader>
          <CardTitle>{de.awards.hallOfFame}</CardTitle>
          <p className="text-xs text-muted-foreground">{de.awards.hofHint}</p>
        </CardHeader>
        <CardContent>
          {hof.length === 0 ? (
            <p className="text-sm text-muted-foreground">{de.awards.hofEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {hof.map((h) => (
                <li key={h.monthLabel} className="flex items-center gap-3 rounded-md border p-3">
                  <span className="text-2xl">🏆</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Avatar userId={h.overall.userId} name={h.overall.name} hasAvatar={h.overall.hasAvatar} size="sm" />
                      <span className="truncate font-medium">{h.overall.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{h.overall.value}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{h.monthLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
