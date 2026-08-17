import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getAdminPromotions } from '@/features/promotions/queries';
import { PromotionsAdmin } from '@/features/promotions/components/promotions-admin';

export const dynamic = 'force-dynamic';

/**
 * Backend zur Pflege aktueller Promotions/Aktionen (z. B. „400 € Google Ads
 * Werbebudget gratis") inkl. Konditionen. Mehrere gleichzeitig möglich,
 * Änderungen wirken sofort ohne Deploy. Nur Agentur-Admins.
 */
export default async function PromotionsPage() {
  const { user, orgId } = await requireAgencyPage();
  if (!isOrgAdmin(user, orgId)) redirect('/app');

  const promotions = await getAdminPromotions(orgId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🎁 Promotions</h1>
          <p className="text-sm text-muted-foreground">
            Aktuelle Aktionen und ihre Konditionen – Änderungen wirken sofort,
            ohne Deploy.
          </p>
        </div>
        <Link
          href="/app/leads"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Zu den Leads
        </Link>
      </div>

      <PromotionsAdmin orgId={orgId} promotions={promotions} />
    </div>
  );
}
