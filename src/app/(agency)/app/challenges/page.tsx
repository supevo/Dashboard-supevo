import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { listOrgChallenges } from '@/features/gamification/custom-challenges';
import { METRIC_OPTIONS } from '@/features/gamification/challenge-metrics';
import { ChallengeAdmin } from '@/features/gamification/components/challenge-admin';

export const dynamic = 'force-dynamic';

export default async function ChallengesAdminPage() {
  const { orgId } = await requireOrgAdminPage();
  const challenges = await listOrgChallenges(orgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Wochen- & Team-Challenges</h1>
        <p className="text-sm text-muted-foreground">
          Lege eigene Challenges an, plane sie je Woche vor und vergib eigene Badges.
          Bei Zielerreichung bekommt der/die Mitarbeiter:in automatisch XP + Badge.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Challenges verwalten</CardTitle>
        </CardHeader>
        <CardContent>
          <ChallengeAdmin challenges={challenges} metricOptions={METRIC_OPTIONS} />
        </CardContent>
      </Card>
    </div>
  );
}
