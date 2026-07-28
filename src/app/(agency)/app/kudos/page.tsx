import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { listRecentKudos, getLeaderboard } from '@/features/kudos/queries';
import { badgeLabel } from '@/features/kudos/badges';
import { getLevelHub } from '@/features/gamification/hub';
import { getWeeklyChallenges } from '@/features/gamification/challenges';
import { formatTenure, currentTenureBadge } from '@/features/gamification/tenure';
import { BADGE_REASON } from '@/features/gamification/badge-catalog';
import { BadgeUnlockOverlay } from '@/features/gamification/components/badge-unlock-overlay';
import { EasterEggBadge } from '@/features/gamification/components/badge-test-controls';
import { LevelRing } from '@/features/gamification/components/level-ring';
import { SkillRadar } from '@/features/gamification/components/skill-radar';
import { StatTile } from '@/features/gamification/components/stat-tile';
import { cn } from '@/lib/utils';
import { AwardsSummary } from '@/features/awards/components/awards-summary';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

const MEDAL = ['🥇', '🥈', '🥉'];
const t = de.hub;

export default async function KudosPage() {
  const { user, orgId } = await requireAgencyPage();
  const admin = isOrgAdmin(user, orgId);
  const [hub, feed, leaderboard, weekly] = await Promise.all([
    getLevelHub(user.id, orgId),
    listRecentKudos(12),
    getLeaderboard(),
    getWeeklyChallenges(user.id, orgId),
  ]);

  const league = hub.league;

  // Currently-earned badges (wall + rare) for the one-time unlock animation.
  const unlockedBadges = [
    ...hub.badgeWall
      .filter((b) => b.earned)
      .map((b) => ({
        key: b.key,
        name: b.name,
        emoji: b.emoji,
        reason: BADGE_REASON.get(b.key) ?? '',
      })),
    ...weekly.rareBadges
      .filter((b) => b.earned)
      .map((b) => ({ key: `rare_${b.key}`, name: b.name, emoji: b.emoji, reason: b.reason })),
  ];

  return (
    <div className="space-y-6">
      <BadgeUnlockOverlay badges={unlockedBadges} />
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
          <span className="text-2xl" aria-hidden>
            {currentTenureBadge(hub.daysInCompany)?.emoji ?? '📅'}
          </span>
          <div>
            <div className="text-xs text-muted-foreground">{t.inCompany}</div>
            <div className="font-semibold">{formatTenure(hub.daysInCompany)}</div>
            {currentTenureBadge(hub.daysInCompany) && (
              <div className="text-xs text-amber-500" title="Dienstjubiläum">
                {currentTenureBadge(hub.daysInCompany)!.name}
              </div>
            )}
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
          {/* Wochenchallenges */}
          <Card>
            <CardHeader>
              <div className="flex items-baseline justify-between gap-2">
                <CardTitle>{t.challenges}</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {weekly.weekLabel} ·{' '}
                  {t.challengesSub.replace('{days}', String(weekly.daysLeft))}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-4">
                {weekly.challenges.map((c) => (
                  <li key={c.key}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden>{c.emoji}</span>
                        <span className="truncate font-medium">{c.title}</span>
                        {c.rareName && !c.done && (
                          <span className="shrink-0 text-xs text-amber-500" title={t.rareBadges}>
                            ✦
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-xs font-semibold',
                          c.done ? 'text-emerald-500' : 'text-primary',
                        )}
                      >
                        {c.done ? t.challengeDone : `+${c.xp} XP`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            c.done ? 'bg-emerald-500' : 'bg-primary',
                          )}
                          style={{ width: `${(c.progress / c.target) * 100}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                        {c.progress}/{c.target}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="border-t pt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.rareBadges}
                  </span>
                  <span className="text-xs text-muted-foreground">{t.rareHint}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {weekly.rareBadges.map((b) => (
                    <span
                      key={b.key}
                      title={b.name}
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-lg border text-xl transition',
                        b.earned
                          ? 'border-amber-400/50 bg-amber-400/10'
                          : 'opacity-30 grayscale',
                      )}
                    >
                      <span aria-hidden>{b.emoji}</span>
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Auszeichnungen: Trophäen + Badge-Wand (direkt unter den Wochenchallenges) */}
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
                      <span className="text-muted-foreground">{tr.monthLabel}</span>
                    </li>
                  ))}
                </ul>
              )}

              {hub.badgeWall.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.badges}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.badgesUnlocked
                        .replace('{n}', String(hub.badgeWall.filter((b) => b.earned).length))
                        .replace('{total}', String(hub.badgeWall.length))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {hub.badgeWall.map((b) => (
                      <span
                        key={b.key}
                        title={b.name}
                        className={cn(
                          'flex h-12 w-12 items-center justify-center rounded-lg border text-2xl transition',
                          b.earned ? 'border-primary/30 bg-primary/5' : 'opacity-30 grayscale',
                        )}
                      >
                        <span aria-hidden>{b.emoji}</span>
                      </span>
                    ))}
                    <EasterEggBadge />
                  </div>
                </div>
              )}

              {hub.trophies.length === 0 && hub.badgeWall.every((b) => !b.earned) && (
                <p className="text-sm text-muted-foreground">{t.achievementsEmpty}</p>
              )}
            </CardContent>
          </Card>

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
          {/* Skills: radar + full list */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t.skillsTitle}</CardTitle>
                <Link href="/app/profile" className="text-xs text-primary hover:underline">
                  {t.editInProfile}
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {hub.radar.length >= 3 && <SkillRadar skills={hub.radar} />}
              {hub.skills.length > 0 ? (
                <ul className="space-y-2">
                  {hub.skills.map((s) => (
                    <li key={s.name}>
                      <div className="mb-0.5 flex items-center justify-between text-xs">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground">{s.level}/10</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-violet-500"
                          style={{ width: `${(s.level / 10) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t.skillsEmpty}</p>
              )}
            </CardContent>
          </Card>

          {/* Lieblingsarbeit (Herzen) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t.prefsTitle}</CardTitle>
                <Link href="/app/profile" className="text-xs text-primary hover:underline">
                  {t.editInProfile}
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {hub.preferences.length > 0 ? (
                <ul className="space-y-1.5">
                  {hub.preferences.map((p) => (
                    <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="shrink-0 text-rose-500" aria-label={`${p.level} von 10`}>
                        {'♥'.repeat(Math.min(5, Math.round(p.level / 2))) || '♥'}
                        <span className="ml-1 text-xs text-muted-foreground">{p.level}/10</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t.prefsEmpty}</p>
              )}
            </CardContent>
          </Card>

          {/* Meine Anerkennungen (erhaltene Kudos-Arten) */}
          <Card>
            <CardHeader>
              <CardTitle>{t.recognitions}</CardTitle>
            </CardHeader>
            <CardContent>
              {hub.badges.length > 0 ? (
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
              ) : (
                <p className="text-sm text-muted-foreground">{t.recognitionsEmpty}</p>
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
