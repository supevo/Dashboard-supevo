import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getAdminCatalog } from '@/features/memberships/catalog-queries';
import { ModuleCatalogAdmin } from '@/features/memberships/components/module-catalog-admin';

export const dynamic = 'force-dynamic';

/**
 * Backend zur Pflege des Mitgliedschafts-Baukastens: Kategorien + Module inkl.
 * Preise – ohne Deploy änderbar. Nur Agentur-Admins.
 */
export default async function PaketePage() {
  const { user, orgId } = await requireAgencyPage();
  if (!isOrgAdmin(user, orgId)) redirect('/app');

  const catalog = await getAdminCatalog(orgId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🧩 Pakete &amp; Module</h1>
          <p className="text-sm text-muted-foreground">
            Module und Preise für den Onboarding-Baukasten – Änderungen wirken
            sofort, ohne Deploy.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/app/promotions"
            className="text-muted-foreground hover:text-foreground"
          >
            🎁 Promotions
          </Link>
          <Link
            href="/app/leads"
            className="text-muted-foreground hover:text-foreground"
          >
            ← Zu den Leads
          </Link>
        </div>
      </div>

      <ModuleCatalogAdmin orgId={orgId} catalog={catalog} />
    </div>
  );
}
