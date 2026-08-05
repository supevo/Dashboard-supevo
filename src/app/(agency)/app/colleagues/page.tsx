import Link from 'next/link';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { listColleagues } from '@/features/team/colleague';
import { getActiveXpBoost } from '@/features/gamification/xp-boost';
import { XpBoostBanner } from '@/features/gamification/components/xp-boost-banner';
import { LeagueBadge } from '@/features/gamification/components/league-badge';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

export default async function ColleaguesPage() {
  const { orgId } = await requireAgencyPage();
  const [colleagues, xpBoost] = await Promise.all([
    listColleagues(orgId),
    getActiveXpBoost(orgId),
  ]);

  return (
    <div className="space-y-6">
      <XpBoostBanner boost={xpBoost} />
      <div>
        <h1 className="text-2xl font-bold">{de.nav.colleagues}</h1>
        <p className="text-sm text-muted-foreground">{de.colleagues.subtitle}</p>
      </div>

      {colleagues.length === 0 ? (
        <p className="text-sm text-muted-foreground">{de.colleagues.empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {colleagues.map((c) => (
            <Link key={c.userId} href={`/app/team/${c.userId}`}>
              <Card className="transition hover:border-primary/40 hover:shadow-sm">
                <CardContent className="flex items-center gap-3 py-4">
                  <Avatar
                    userId={c.userId}
                    name={c.name}
                    hasAvatar={c.hasAvatar}
                    status={c.status}
                    size="lg"
                    className="h-12 w-12"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{c.name}</span>
                      {c.isSelf && (
                        <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                          {de.colleagues.you}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.roleLabel}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="font-medium text-primary">
                        {de.level.title} {c.level}
                      </span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground" title={c.leagueName}>
                        <LeagueBadge
                          league={{ emoji: c.leagueEmoji, iconUrl: c.leagueIconUrl, name: c.leagueName }}
                          size={14}
                        />{' '}
                        {c.leagueName}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
