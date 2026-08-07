import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { AwardsOverview } from '@/features/awards/components/awards-overview';

export const dynamic = 'force-dynamic';

export default async function AwardsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { user, orgId } = await requireAgencyPage();
  const { month } = await searchParams;

  return (
    <div className="space-y-6">
      <AwardsOverview
        orgId={orgId}
        viewerId={user.id}
        viewerName={user.fullName ?? user.email}
        isAdmin={isOrgAdmin(user, orgId)}
        monthParam={month}
        monthHrefPrefix="/app/awards?month="
      />
    </div>
  );
}
