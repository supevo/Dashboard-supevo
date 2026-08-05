import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getColleagueProfile } from '@/features/team/colleague';
import { JoinDateEditor } from '@/features/team/components/join-date-editor';
import { WeeklyTargetEditor } from '@/features/team/components/weekly-target-editor';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { formatTenure, currentTenureBadge } from '@/features/gamification/tenure';
import { LevelRing } from '@/features/gamification/components/level-ring';
import { StatTile } from '@/features/gamification/components/stat-tile';
import { LeagueBadge } from '@/features/gamification/components/league-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

function fmtDate(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('.');
}

export default async function ColleagueProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { user, orgId } = await requireAgencyPage();
  const admin = isOrgAdmin(user, orgId);

  const p = await getColleagueProfile(orgId, userId);
  if (!p) notFound();

  // Admin-only: the member's configured weekly target (null → app default).
  let weeklyTarget: number | null = null;
  if (admin) {
    const { data } = await createSupabaseServiceClient()
      .from('memberships')
      .select('weekly_target_hours')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();
    weeklyTarget = data?.weekly_target_hours ?? null;
  }

  const t = de.hub;
  const league = p.league;
  const tenureBadge = currentTenureBadge(p.daysInCompany);
  const earned = p.badgeWall.filter((b) => b.earned).length;

  return (
    <div className="space-y-6">
      <Link href="/app/colleagues" className="text-sm text-primary hover:underline">
        ← {de.nav.colleagues}
      </Link>

      {/* Top badges: league · tenure · level */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <LeagueBadge league={league.current} size={28} className="text-2xl" />
          <div>
            <div className="text-xs text-muted-foreground">{t.league}</div>
            <div className="font-semibold" style={{ color: league.current.color }}>
              {league.label}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <span className="text-2xl" aria-hidden>{tenureBadge?.emoji ?? '📅'}</span>
          <div>
            <div className="text-xs text-muted-foreground">{t.inCompany}</div>
            <div className="font-semibold">{formatTenure(p.daysInCompany)}</div>
            {tenureBadge && (
              <div className="text-xs text-amber-500" title="Dienstjubiläum">
                {tenureBadge.name}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <span className="text-2xl" aria-hidden>⭐</span>
          <div>
            <div className="text-xs text-muted-foreground">{de.level.title}</div>
            <div className="font-semibold">
              {de.level.title} {p.level}
            </div>
          </div>
        </div>
      </div>

      {/* Profile header with title-image background */}
      <Card className="relative overflow-hidden border-0">
        <div aria-hidden className="absolute inset-0" style={{ background: p.bannerBackground }} />
        <CardContent className="relative flex flex-col items-center gap-6 py-6 sm:flex-row sm:items-center">
          <LevelRing
            level={p.level}
            points={p.points}
            progressPct={p.levelProgressPct}
            avatar={{ userId: p.userId, name: p.name, hasAvatar: p.hasAvatar }}
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="inline-block rounded-lg bg-background/70 px-4 py-3 backdrop-blur">
              <h1 className="text-2xl font-bold">{p.name}</h1>
              <p className="text-sm text-muted-foreground">
                {p.roleLabel} · seit {fmtDate(p.joinedAt)}
              </p>
              <div className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {de.level.title} {p.level}
                <span className="ml-2 text-sm font-medium text-muted-foreground">
                  {p.xpIntoLevel}/{p.xpForLevel} XP
                </span>
              </div>
              <div className="mt-3 max-w-sm">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <LeagueBadge league={league.current} size={14} /> {league.label}
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
                    style={{ width: `${league.progressPct}%`, backgroundColor: league.current.color }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon="🎯" color="emerald" value={p.stats.missions} label={t.stats.missions} />
        <StatTile icon="💬" color="cyan" value={p.stats.socialActivity} label={t.stats.social} />
        <StatTile icon="📊" color="violet" value={p.stats.competences} label={t.stats.competences} />
        <StatTile icon="❤️" color="pink" value={p.stats.helpfulness} label={t.stats.helpfulness} />
      </div>

      {/* Admin: Eintrittsdatum setzen */}
      {admin && (
        <Card>
          <CardHeader>
            <CardTitle>{de.team.joinDate}</CardTitle>
          </CardHeader>
          <CardContent>
            <JoinDateEditor orgId={orgId} targetUserId={p.userId} current={p.joinedExplicit} />
            <p className="mt-2 text-xs text-muted-foreground">
              Leer lassen + speichern setzt auf das Systemdatum zurück.
            </p>
            <div className="mt-4 border-t pt-4">
              <WeeklyTargetEditor orgId={orgId} targetUserId={p.userId} current={weeklyTarget} />
              <p className="mt-2 text-xs text-muted-foreground">
                Wöchentliches Stunden-Soll für die &bdquo;Arbeitszeit&ldquo;-Anzeige.
                Leer = Standard (40 Std).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Badge-Wand (freigespielt farbig, gesperrt ausgegraut) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t.achievements}</CardTitle>
            <span className="text-xs text-muted-foreground">
              {t.badgesUnlocked
                .replace('{n}', String(earned))
                .replace('{total}', String(p.badgeWall.length))}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {p.badgeWall.length > 0 ? (
            <div className="flex flex-wrap gap-2.5">
              {p.badgeWall.map((b) => (
                <span
                  key={b.key}
                  title={b.name}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-lg border text-2xl',
                    b.earned
                      ? 'border-primary/30 bg-primary/5'
                      : 'opacity-30 grayscale',
                  )}
                >
                  <span aria-hidden>{b.emoji}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t.achievementsEmpty}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fähigkeiten */}
        <Card>
          <CardHeader>
            <CardTitle>{t.skillsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {p.skills.length > 0 ? (
              <ul className="space-y-2">
                {p.skills.map((s) => (
                  <li key={s.name}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground">{s.level}/10</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${(s.level / 10) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t.skillsEmpty}</p>
            )}
          </CardContent>
        </Card>

        {/* Lieblingsarbeit */}
        <Card>
          <CardHeader>
            <CardTitle>{t.prefsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {p.preferences.length > 0 ? (
              <ul className="space-y-2">
                {p.preferences.map((pref) => (
                  <li key={pref.name}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="font-medium">{pref.name}</span>
                      <span className="text-muted-foreground">{pref.level}/10</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-rose-500"
                        style={{ width: `${(pref.level / 10) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t.prefsEmpty}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
