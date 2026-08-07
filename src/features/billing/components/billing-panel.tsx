import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { listBillingEntities } from '@/features/billing/queries';
import {
  BillingEntityCard,
  AddBillingEntity,
} from '@/features/billing/components/billing-entity-form';

/**
 * Rechnungen: billing entities (Rechnungssteller) and the SEPA export. Extracted
 * so it can live in the Finanzen module. Each billing entity is a company that
 * issues invoices with its own sender, bank details and invoice number range.
 */
export async function BillingPanel({ orgId }: { orgId: string }) {
  const entities = await listBillingEntities(orgId);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Rechnungssteller sind die Firmen, in deren Namen Rechnungen gestellt
        werden. Jeder hat einen eigenen Absender, eigene Bankdaten und einen
        eigenen Rechnungsnummernkreis. Kunden werden im Kundenprofil einem
        Rechnungssteller zugeordnet.
      </p>

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
            Firmenname, IBAN und Gläubiger-ID sind hinterlegt und die betreffenden
            Kunden haben ein SEPA-Mandat.
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
