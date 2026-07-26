import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { listObjectivesForUser } from '@/features/goals/queries';
import { listColleagues } from '@/features/kudos/queries';
import { GoalsManager } from '@/features/goals/components/goals-manager';
import { de } from '@/lib/i18n/de';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const { user, orgId } = await requireAgencyPage();
  const admin = isOrgAdmin(user, orgId);
  const { user: userParam } = await searchParams;

  // Non-admins only manage their own goals.
  const ownerId = admin && userParam ? userParam : user.id;
  const [objectives, colleagues] = await Promise.all([
    listObjectivesForUser(ownerId),
    admin ? listColleagues(orgId, user.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.goals.title}</h1>
        <p className="text-sm text-muted-foreground">{de.goals.subtitle}</p>
      </div>

      {admin && colleagues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/app/goals"
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              ownerId === user.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
            )}
          >
            {de.goals.mine}
          </Link>
          {colleagues.map((c) => (
            <Link
              key={c.id}
              href={`/app/goals?user=${c.id}`}
              className={cn(
                'rounded-full border px-3 py-1 text-sm',
                ownerId === c.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{de.goals.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <GoalsManager ownerId={ownerId} objectives={objectives} />
        </CardContent>
      </Card>
    </div>
  );
}
