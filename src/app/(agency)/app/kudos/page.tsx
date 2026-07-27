import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { listRecentKudos, getLeaderboard } from '@/features/kudos/queries';
import { badgeLabel } from '@/features/kudos/badges';
import { getLevelHub } from '@/features/gamification/hub';
import { LevelRing } from '@/features/gamification/components/level-ring';
import { SkillRadar } from '@/features/gamification/components/skill-radar';
import { StatTile } from '@/features/gamification/components/stat-tile';
import { AwardsSummary } from '@/features/awards/components/awards-summary';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

const MEDAL = ['🥇', '🥈', '🥉'];
const t = de.hub;

export default async function KudosPage() {
  const { user, orgId } = await requireAgencyPage();
  const admin = isOrgAdmin(user, orgId);
  const [hub, feed, leaderboard] = await Promise.all([
    getLevelHub(user.id, orgId),
    listRecentKudos(12),
    getLeaderboard(),
  ]);

  const league = hub.league;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.nav.levelHub}</h1>
        <p className="text-sm text-muted-foreground">{de.kudos.subtitle}</p>
      </div>

      {/* Top badges: league · tenure · level */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <span className="text-2xl" aria-hidden>{league.current.emoji}</span>
          <div>
            <div className="text-xs text-muted-foreground">{t.league}</div>
            <div className="font-semibold" style={{ color: league.current.color }}>
              {league.current.name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <span className="text-2xl" aria-hidden>📅</span>
          <div>
            <div className="text-xs text-muted-foreground">{t.inCompany}</div>
            <div className="font-semibold">
              {hub.daysInCompany} {t.days}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <span className="text-2xl" aria-hidden>⭐</span>
          <div>
            <div className="text-xs text-muted-foreground">{de.level.title}</div>
            <div className="font-semibold">
              {de.level.title} {hub.level}
            </div>
          </div>
        </div>
      </div>

      {/* Profile header */}
      <Card>
        <CardContent className="flex flex-col items-center gap-6 py-6 sm:flex-row sm:items-center">
          <LevelRing
            level={hub.level}
            points={hub.points}
            nextLevelPoints={hub.nextLevelPoints}
            progressPct={hub.levelProgressPct}
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-2xl font-bold">{hub.name}</h2>
            <p className="text-sm text-muted-foreground">
              {hub.specialty ? `${hub.specialty} · ` : ''}
              {hub.roleLabel}
            </p>
            <div className="mt-3 max-w-sm">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {league.current.emoji} {league.current.name}
                </span>
                {league.next ? (
                  <span>
                    {t.toNextLeague
                      .replace('{points}', String(league.toNext))
                      .replace('{league}', league.next.name)}
                  </span>
                ) : (
                  <span>{t.topLeague}</span>
                )}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${league.progressPct}%`,
                    backgroundColor: league.current.color,
                  }}
                />
              </div>
            </div>
          </div>
          <Avatar
            userId={user.id}
            name={hub.name}
            hasAvatar={hub.hasAvatar}
            size="lg"
            className="h-28 w-28 shrink-0"
          />
        </CardContent>
      </Card>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon="🎯" color="emerald" value={hub.stats.missions} label={t.stats.missions} />
        <StatTile icon="💬" color="cyan" value={hub.stats.socialActivity} label={t.stats.social} />
        <StatTile icon="📊" color="violet" value={hub.stats.competences} label={t.stats.competences} />
        <StatTile icon="❤️" color="pink" value={hub.stats.helpfulness} label={t.stats.helpfulness} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {/* KPIs */}
          <Card>
            <CardHeader>
              <CardTitle>{t.kpis}</CardTitle>
            </CardHeader>
            <CardContent>
              {hub.objectives.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.kpisEmpty}</p>
              ) : (
                <ul className="space-y-4">
                  {hub.objectives.map((o) => (
                    <li key={o.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {o.title}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-primary">
                          {o.progress}%
                        </span>
                      </div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        {o.period ?? t.noDeadline}
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${o.progress}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Award of the month (admin sees full; others get the reveal hint) */}
          <AwardsSummary orgId={orgId} userId={user.id} canSeeFull={admin} />

          {/* Activity feed */}
          <Card>
            <CardHeader>
              <CardTitle>{t.activity}</CardTitle>
            </CardHeader>
            <CardContent>
              {feed.length === 0 ? (
                <p className="text-sm text-muted-foreground">{de.kudos.empty}</p>
              ) : (
                <ul className="space-y-3">
                  {feed.map((k) => (
                    <li key={k.id} className="flex items-start gap-3">
                      <Avatar userId={k.toUserId} name={k.toName} hasAvatar={false} size="sm" />
                      <div className="min-w-0">
                        <div className="text-sm">
                          <span className="font-medium">{k.toName}</span>{' '}
                          {de.kudos.received}{' '}
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                            {k.badge === 'task' ? de.taskKudos.title : badgeLabel(k.badge)} +{k.points}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(k.createdAt).toLocaleDateString('de-DE')}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Competence radar */}
          <Card>
            <CardHeader>
              <CardTitle>{t.competencesTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              {hub.radar.length >= 3 ? (
                <SkillRadar skills={hub.radar} />
              ) : (
                <p className="text-sm text-muted-foreground">{t.radarEmpty}</p>
              )}
            </CardContent>
          </Card>

          {/* Achievements */}
          <Card>
            <CardHeader>
              <CardTitle>{t.achievements}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {hub.trophies.length > 0 && (
                <ul className="space-y-2">
                  {hub.trophies.map((tr) => (
                    <li key={`${tr.year}-${tr.month}`} className="flex items-center gap-2 text-sm">
                      <span aria-hidden>🏆</span>
                      <span className="font-medium">{t.trophies}</span>
                      <span className="text-muted-foreground">
                        {tr.monthLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {hub.badges.length === 0 ? (
                hub.trophies.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t.achievementsEmpty}
                  </p>
                )
              ) : (
                <div className="flex flex-wrap gap-2">
                  {hub.badges.map((b) => (
                    <span
                      key={b.key}
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                      title={b.label}
                    >
                      <span aria-hidden>{b.emoji}</span>
                      {b.label}
                      <span className="text-muted-foreground">
                        {t.times}{b.count}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Leaderboard (admin only) */}
          <Card>
            <CardHeader>
              <CardTitle>{de.kudos.leaderboard}</CardTitle>
            </CardHeader>
            <CardContent>
              {!admin ? (
                <p className="text-sm text-muted-foreground">{de.awards.revealHint}</p>
              ) : leaderboard.length === 0 ? (
                <p className="text-sm text-muted-foreground">{de.kudos.empty}</p>
              ) : (
                <ol className="space-y-2">
                  {leaderboard.slice(0, 10).map((r, i) => (
                    <li key={r.userId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-5 text-center">{MEDAL[i] ?? i + 1}</span>
                        <span className="truncate">{r.name}</span>
                      </span>
                      <span className="shrink-0 font-semibold text-primary">
                        {r.points}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
