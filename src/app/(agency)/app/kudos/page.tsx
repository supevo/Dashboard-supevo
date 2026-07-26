import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import {
  listColleagues,
  listRecentKudos,
  getLeaderboard,
} from '@/features/kudos/queries';
import { GiveKudos } from '@/features/kudos/components/give-kudos';
import { badgeLabel } from '@/features/kudos/badges';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

const MEDAL = ['🥇', '🥈', '🥉'];

export default async function KudosPage() {
  const { user, orgId } = await requireAgencyPage();
  const [colleagues, feed, leaderboard] = await Promise.all([
    listColleagues(orgId, user.id),
    listRecentKudos(30),
    getLeaderboard(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.kudos.title}</h1>
        <p className="text-sm text-muted-foreground">{de.kudos.subtitle}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{de.kudos.give}</CardTitle>
            </CardHeader>
            <CardContent>
              <GiveKudos colleagues={colleagues} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.kudos.feed}</CardTitle>
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
                          <span className="font-medium">{k.fromName}</span>{' '}
                          {de.kudos.gaveTo}{' '}
                          <span className="font-medium">{k.toName}</span>{' '}
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                            {badgeLabel(k.badge)} +{k.points}
                          </span>
                        </div>
                        {k.message && (
                          <div className="text-sm text-muted-foreground">
                            „{k.message}“
                          </div>
                        )}
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

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{de.kudos.leaderboard}</CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
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
  );
}
