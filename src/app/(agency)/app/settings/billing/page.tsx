import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
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

      <Card>
        <CardHeader>
          <CardTitle>SEPA-Lastschrift</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Erzeugt eine SEPA-Datei (pain.008) mit allen offenen
            Lastschrift-Rechnungen zum Import in dein Bank-Programm. Voraussetzung:
            Firmenname, IBAN und Gläubiger-ID sind hinterlegt und die
            betreffenden Kunden haben ein SEPA-Mandat.
          </p>
          <a
            href="/api/billing/sepa"
            className={buttonVariants({ variant: 'outline' })}
          >
            SEPA-Datei erzeugen
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
