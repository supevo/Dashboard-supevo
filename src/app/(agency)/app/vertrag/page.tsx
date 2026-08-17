import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { getContractTerms } from '@/features/contracts/queries';
import { ContractTermsForm } from '@/features/contracts/components/contract-terms-form';

export const dynamic = 'force-dynamic';

/** Backend: org-weiten Vertragskonditionstext pflegen. Nur Agentur-Admins. */
export default async function VertragSettingsPage() {
  const { user, orgId } = await requireAgencyPage();
  if (!isOrgAdmin(user, orgId)) redirect('/app');

  const terms = await getContractTerms(orgId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📄 Vertragskonditionen</h1>
          <p className="text-sm text-muted-foreground">
            Dieser Text erscheint als Rechtstext im generierten Vertrag. Platzhalter
            – bitte juristisch prüfen. Firmendaten, Positionen und Preise kommen
            automatisch dazu.
          </p>
        </div>
        <Link
          href="/app/leads"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Zu den Leads
        </Link>
      </div>

      <ContractTermsForm orgId={orgId} terms={terms} />
    </div>
  );
}
