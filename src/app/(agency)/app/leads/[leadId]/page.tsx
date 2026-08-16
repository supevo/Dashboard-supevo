import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getLeadOffer } from '@/features/leads/queries';
import { MembershipConfigurator } from '@/features/memberships/components/membership-configurator';

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
      <div>
        <Link
          href="/app/leads"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Zurück
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">🚀 Ihr Paket – {title}</h1>
        <p className="mt-1 text-muted-foreground">
          Wir stellen gemeinsam Ihr Paket zusammen – der Preis passt sich sofort an.
        </p>
      </div>

      <MembershipConfigurator
        mode="lead"
        modules={offer.modules}
        leadId={leadId}
        initialSelections={offer.selections}
        priceContext={offer.priceContext}
        pending={null}
      />
    </div>
  );
}
