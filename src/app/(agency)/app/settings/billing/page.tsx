import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { listBillingEntities } from '@/features/billing/queries';
import {
  BillingEntityCard,
  AddBillingEntity,
} from '@/features/billing/components/billing-entity-form';

export default async function BillingSettingsPage() {
  const { orgId } = await requireOrgAdminPage();
  const entities = await listBillingEntities(orgId);

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
          Rechnungssteller sind die Firmen, in deren Namen Rechnungen gestellt
          werden. Jeder hat einen eigenen Absender, eigene Bankdaten und einen
          eigenen Rechnungsnummernkreis. Kunden werden im Kundenprofil einem
          Rechnungssteller zugeordnet.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rechnungssteller</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {entities.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch kein Rechnungssteller angelegt. Lege den ersten an – er wird
              automatisch zum Standard.
            </p>
          )}
          {entities.map((entity) => (
            <BillingEntityCard
              key={entity.id}
              orgId={orgId}
              entity={entity}
              defaultOpen={entities.length === 1}
            />
          ))}
          <div className="pt-1">
            <AddBillingEntity orgId={orgId} />
          </div>
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
