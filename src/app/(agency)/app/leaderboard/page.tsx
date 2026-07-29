import { Card, CardContent } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getXpLeaderboards } from '@/features/gamification/leaderboard';
import { Leaderboard } from '@/features/gamification/components/leaderboard';

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const { user, orgId } = await requireAgencyPage();
  const boards = await getXpLeaderboards(orgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🏆 Rangliste</h1>
        <p className="text-sm text-muted-foreground">
          XP-Rangliste des Teams – nach Woche, Monat und gesamt.
        </p>
      </div>
      <Card>
        <CardContent className="py-5">
          <Leaderboard boards={boards} currentUserId={user.id} />
        </CardContent>
      </Card>
    </div>
  );
}
