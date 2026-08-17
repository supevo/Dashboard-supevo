import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { buildContractFromClient } from '@/features/contracts/queries';
import { ContractDocument } from '@/features/contracts/components/contract-document';
import { PrintButton } from '@/features/contracts/components/print-button';

export const dynamic = 'force-dynamic';

/** Druckbarer Vertrag aus der Mitgliedschaft eines bestehenden Kunden. */
export default async function ClientContractPage({
  params,
}: {
  params: Promise<{ clientCompanyId: string }>;
}) {
  const { clientCompanyId } = await params;
  await requireAgencyPage();

  const data = await buildContractFromClient(clientCompanyId);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between gap-3">
        <Link
          href={`/app/clients/${clientCompanyId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Zurück zum Kunden
        </Link>
        <PrintButton />
      </div>
      <ContractDocument data={data} />
    </div>
  );
}
