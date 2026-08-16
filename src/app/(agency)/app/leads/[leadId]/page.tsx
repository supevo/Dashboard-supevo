import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getLeadOffer } from '@/features/leads/queries';
import { MembershipConfigurator } from '@/features/memberships/components/membership-configurator';
import { LeadConvertButton } from '@/features/leads/components/lead-convert-button';

export const dynamic = 'force-dynamic';

/**
 * Onboarding-Termin: fokussierte Angebots-Ansicht für einen Lead. Bausteine
 * zusammenstellen, der Preis rechnet live mit (grün) – ideal, um den Bildschirm
 * im Erstgespräch herumzudrehen. Das Angebot wird am Lead gespeichert.
 */
export default async function LeadOfferPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  await requireAgencyPage();

  const offer = await getLeadOffer(leadId);
  if (!offer) notFound();

  const title = offer.company || offer.contactName;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/app/leads"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Zurück zu den Leads
        </Link>
        <span className="text-xs text-muted-foreground">Onboarding-Termin</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold">🚀 Ihr Paket – {title}</h1>
        <p className="mt-1 text-muted-foreground">
          Wir stellen gemeinsam Ihr Paket zusammen – der Preis passt sich sofort an.
        </p>
      </div>

      <MembershipConfigurator
        mode="lead"
        leadId={leadId}
        initialSelections={offer.selections}
        initialName={offer.offerName}
        priceContext={offer.priceContext}
        pending={null}
      />

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="mb-2 text-sm font-medium">Lead gewonnen?</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Übernimmt den Lead als Kunden und legt die Mitgliedschaft aus dem
          aktuellen Paket an. Bitte vorher speichern, damit das Paket übernommen
          wird.
        </p>
        <LeadConvertButton
          leadId={leadId}
          convertedClientCompanyId={offer.convertedClientCompanyId}
        />
      </div>
    </div>
  );
}
