import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { getPortalMembership } from '@/features/billing/portal';
import { PortalMembership } from '@/features/billing/components/portal-membership';
import { de } from '@/lib/i18n/de';

export const dynamic = 'force-dynamic';

export default async function PortalMembershipPage() {
  await requireClientPage();
  const membershipView = await getPortalMembership();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{de.nav.membership}</h1>
        <p className="text-sm text-muted-foreground">
          Hier sehen Sie Ihr aktuelles Paket und können es anpassen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{de.nav.membership}</CardTitle>
        </CardHeader>
        <CardContent>
          {membershipView ? (
            <PortalMembership view={membershipView} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Für Ihr Konto ist aktuell keine Mitgliedschaft hinterlegt.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
