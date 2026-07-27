import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { listBillingEntities } from '@/features/billing/queries';
import { isAiEnabled } from '@/lib/ai/complete';
import { ClientImportWizard } from '@/features/clients/components/client-import-wizard';
import { de } from '@/lib/i18n/de';

export default async function ClientImportPage() {
  const { orgId } = await requireOrgAdminPage();
  const entities = await listBillingEntities(orgId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/app/clients" className="text-sm text-primary hover:underline">
          ← {de.clients.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{de.clientImport.title}</h1>
        <p className="text-sm text-muted-foreground">{de.clientImport.subtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{de.clientImport.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientImportWizard
            orgId={orgId}
            entities={entities}
            aiEnabled={isAiEnabled()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
