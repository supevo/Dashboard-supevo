import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { getBillingSettings } from '@/features/billing/queries';
import { BillingSettingsForm } from '@/features/billing/components/billing-settings-form';

export default async function BillingSettingsPage() {
  const { orgId } = await requireOrgAdminPage();
  const settings = await getBillingSettings(orgId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/app/settings"
          className="text-sm text-primary hover:underline"
        >
          ← Zurück zu den Einstellungen
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Firma &amp; Rechnung</h1>
        <p className="text-sm text-muted-foreground">
          Diese Angaben erscheinen auf den Rechnungen und werden für den
          SEPA-Einzug verwendet.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rechnungseinstellungen</CardTitle>
        </CardHeader>
        <CardContent>
          <BillingSettingsForm orgId={orgId} settings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
