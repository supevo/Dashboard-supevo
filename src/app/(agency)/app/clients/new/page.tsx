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
              Stelle das Paket im Baukasten zusammen: supevo Stage 1/2 oder
              einzelne Module. Der Preis ergibt sich live; ein Sonderpreis lässt
              sich über die Module bzw. den Baukasten abbilden.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <MembershipConfiguratorPanel clientCompanyId={clientId} />
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
  const membership = await getClientMembership(clientId);

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
  const onboarding = await getOnboarding(clientId, orgId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Vertrag & Onboarding — {clientName}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Wähle die Bestandteile, generiere den Vertrag aus der Mitgliedschaft,
          bereite das SEPA-Mandat vor und starte das Onboarding.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <OnboardingSetup clientCompanyId={clientId} status={onboarding} />
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
