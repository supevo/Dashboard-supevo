import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { WizardSteps } from '@/features/onboarding/components/wizard-steps';
import { ClientWizardStep1 } from '@/features/client-companies/components/client-wizard-step1';
import { getClientCompany } from '@/features/client-companies/queries';
import { getClientMembership } from '@/features/billing/membership';
import { MembershipConfiguratorPanel } from '@/features/memberships/components/membership-configurator-panel';
import { MembershipBillingForm } from '@/features/billing/components/membership-billing-form';
import { getOnboarding } from '@/features/onboarding/queries';
import { OnboardingSetup } from '@/features/onboarding/components/onboarding-setup';
import { getClientDocuments } from '@/features/client-documents/queries';
import { DocumentSlot } from '@/features/client-documents/components/document-slot';

export const dynamic = 'force-dynamic';

export default async function NewClientWizardPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; client?: string }>;
}) {
  const { orgId } = await requireAgencyPage();
  const sp = await searchParams;
  const step = Number(sp.step ?? '1');
  const clientId = sp.client ?? '';

  // Steps 2–4 require a created client.
  if (step >= 2 && !clientId) redirect('/app/clients/new?step=1');

  const company = clientId ? await getClientCompany(orgId, clientId) : null;
  if (step >= 2 && !company) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Neuer Kunde</h1>
        <Link href="/app/clients" className="text-sm text-muted-foreground hover:underline">
          Abbrechen
        </Link>
      </div>

      <WizardSteps current={step} />

      {step <= 1 && (
        <Card>
          <CardHeader>
            <CardTitle>1. Kundendaten</CardTitle>
            <p className="text-sm text-muted-foreground">
              Lege den Kunden an. Danach folgen Mitgliedschaft, Adresse/SEPA und
              der Vertrag.
            </p>
          </CardHeader>
          <CardContent>
            <ClientWizardStep1 orgId={orgId} />
          </CardContent>
        </Card>
      )}

      {step === 2 && company && (
        <Card>
          <CardHeader>
            <CardTitle>2. Mitgliedschaft — {company.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {company.isLegacy
                ? 'Legacy-Kunde: Module aus dem Baukasten wählen, Preis ergibt sich live.'
                : 'supevo-Kunde: Stage 1 oder Stage 2 wählen.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <MembershipConfiguratorPanel
              clientCompanyId={clientId}
              show={company.isLegacy ? 'modules' : 'stages'}
            />
            <div className="flex justify-end border-t pt-3">
              <Link
                href={`/app/clients/new?step=3&client=${clientId}`}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Weiter zu Adresse & SEPA →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && company && (
        <Step3 orgId={orgId} clientId={clientId} clientName={company.name} />
      )}

      {step === 4 && company && (
        <Step4 orgId={orgId} clientId={clientId} clientName={company.name} />
      )}
    </div>
  );
}

async function Step3({
  orgId,
  clientId,
  clientName,
}: {
  orgId: string;
  clientId: string;
  clientName: string;
}) {
  const [membership, docs] = await Promise.all([
    getClientMembership(clientId),
    getClientDocuments(clientId),
  ]);
  const sepaDoc = docs.find((d) => d.kind === 'sepa_mandate') ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Adresse & SEPA — {clientName}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Erfasse Abrechnung, Rechnungsadresse und das SEPA-Mandat. Das Paket
          selbst hast du in Schritt 2 im Baukasten festgelegt.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <MembershipBillingForm
          orgId={orgId}
          clientCompanyId={clientId}
          membership={membership}
        />
        <DocumentSlot
          clientCompanyId={clientId}
          kind="sepa_mandate"
          label="Unterschriebenes SEPA-Mandat"
          current={sepaDoc}
        />
        <div className="flex justify-end border-t pt-3">
          <Link
            href={`/app/clients/new?step=4&client=${clientId}`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Weiter zum Vertrag →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

async function Step4({
  orgId,
  clientId,
  clientName,
}: {
  orgId: string;
  clientId: string;
  clientName: string;
}) {
  const [onboarding, docs] = await Promise.all([
    getOnboarding(clientId, orgId),
    getClientDocuments(clientId),
  ]);
  const contractDoc = docs.find((d) => d.kind === 'contract') ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Vertrag & Onboarding — {clientName}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Generiere den Vertrag aus der Mitgliedschaft, hinterlege den
          unterschriebenen Vertrag und starte das Onboarding.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <OnboardingSetup clientCompanyId={clientId} status={onboarding} />
        <DocumentSlot
          clientCompanyId={clientId}
          kind="contract"
          label="Unterschriebener Vertrag"
          current={contractDoc}
        />
        <div className="flex justify-end border-t pt-3">
          <Link
            href={`/app/clients/${clientId}`}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Fertig – zur Kundenseite
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
