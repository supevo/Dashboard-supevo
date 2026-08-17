import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { buildContractFromLead } from '@/features/contracts/queries';
import { ContractDocument } from '@/features/contracts/components/contract-document';
import { PrintButton } from '@/features/contracts/components/print-button';

export const dynamic = 'force-dynamic';

/** Druckbarer Vertrag aus einem Lead-Angebot (vor Abschluss). */
export default async function LeadContractPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  await requireAgencyPage();

  const data = await buildContractFromLead(leadId);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between gap-3">
        <Link
          href={`/app/leads/${leadId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Zurück zum Angebot
        </Link>
        <PrintButton />
      </div>
      <ContractDocument data={data} />
    </div>
  );
}
