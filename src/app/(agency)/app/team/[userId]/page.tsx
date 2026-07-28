import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getColleagueProfile } from '@/features/team/colleague';
import { JoinDateEditor } from '@/features/team/components/join-date-editor';
import { formatTenure, currentTenureBadge } from '@/features/gamification/tenure';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  const t = de.hub;

  return (
    <div className="space-y-6">
      <Link href="/app/team" className="text-sm text-primary hover:underline">
        ← {de.team.title}
      </Link>

      {/* Header */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center">
          <Avatar
            userId={p.userId}
            name={p.name}
            hasAvatar={p.hasAvatar}
            status={p.status}
            size="lg"
            className="h-24 w-24"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{p.name}</h1>
            <p className="text-sm text-muted-foreground">{p.roleLabel}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full border px-2.5 py-1">
                {p.league.current.emoji} {p.league.current.name}
              </span>
              <span className="rounded-full border px-2.5 py-1">
                {de.level.title} {p.level}
              </span>
              <span className="rounded-full border px-2.5 py-1">
                📅 {t.inCompany}: {formatTenure(p.daysInCompany)} (seit {fmtDate(p.joinedAt)})
              </span>
              {currentTenureBadge(p.daysInCompany) && (
                <span
                  className="rounded-full border border-amber-400/50 bg-amber-400/10 px-2.5 py-1"
                  title={currentTenureBadge(p.daysInCompany)!.name}
                >
                  {currentTenureBadge(p.daysInCompany)!.emoji}{' '}
                  {currentTenureBadge(p.daysInCompany)!.name}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
          </CardContent>
        </Card>
      )}

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
              <ul className="space-y-1.5">
                {p.preferences.map((pref) => (
                  <li key={pref.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{pref.name}</span>
                    <span className="shrink-0 text-rose-500">
                      {'♥'.repeat(Math.min(5, Math.round(pref.level / 2))) || '♥'}
                      <span className="ml-1 text-xs text-muted-foreground">{pref.level}/10</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t.prefsEmpty}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Auszeichnungen (freigespielt) */}
      <Card>
        <CardHeader>
          <CardTitle>{t.achievements}</CardTitle>
        </CardHeader>
        <CardContent>
          {p.badges.length > 0 ? (
            <div className="flex flex-wrap gap-2.5">
              {p.badges.map((b) => (
                <span
                  key={b.key}
                  title={b.name}
                  className="flex h-12 w-12 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-2xl"
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
    </div>
  );
}
