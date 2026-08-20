import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { listBillingEntities } from '@/features/billing/queries';
import {
  BillingEntityCard,
  AddBillingEntity,
} from '@/features/billing/components/billing-entity-form';
import { MonthlyBillingOverview } from '@/features/billing/components/monthly-billing-overview';

/**
 * Rechnungen: billing entities (Rechnungssteller) and the SEPA export. Extracted
 * so it can live in the Finanzen module. Each billing entity is a company that
 * issues invoices with its own sender, bank details and invoice number range.
 */
export async function BillingPanel({
  orgId,
  year,
  month,
  basePath,
}: {
  orgId: string;
  year: number;
  month: number;
  basePath: string;
}) {
  const entities = await listBillingEntities(orgId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>🧾 Monatsabrechnung Kunden</CardTitle>
          <p className="text-sm text-muted-foreground">
            Alle Mitgliedschaften mit Paket, Zahlweg und Preis inkl. USt. Pro
            Monat siehst du, ob die Rechnung schon generiert/versendet ist –
            „Generieren“ legt einen Entwurf an.
          </p>
        </CardHeader>
        <CardContent>
          <MonthlyBillingOverview
            orgId={orgId}
            year={year}
            month={month}
            basePath={basePath}
          />
        </CardContent>
      </Card>

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
            Erzeugt je Rechnungssteller eine SEPA-Datei (pain.008) mit dessen
            offenen Lastschrift-Rechnungen – jede Firma zieht nur ihre eigenen
            Kunden mit ihrer eigenen Gläubiger-ID ein. Voraussetzung: Firmenname,
            IBAN und Gläubiger-ID sind hinterlegt und die Kunden haben ein Mandat.
          </p>
          <div className="flex flex-col gap-2">
            {entities.map((entity) => {
              const ready = Boolean(entity.iban && entity.creditor_id);
              return (
                <div key={entity.id} className="flex items-center gap-3">
                  {ready ? (
                    <a
                      href={`/api/billing/sepa?entity=${entity.id}`}
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      SEPA-Datei: {entity.company_name || entity.name}
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {entity.company_name || entity.name} – IBAN/Gläubiger-ID fehlt
                    </span>
                  )}
                  {entity.is_default && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      Standard (inkl. Kunden ohne Firma)
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
