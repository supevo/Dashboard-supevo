import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import {
  getClientCompany,
  getClientStage,
  listClientContacts,
} from '@/features/client-companies/queries';
import { InviteContactForm } from '@/features/client-companies/components/invite-contact-form';
import { ContactRow } from '@/features/client-companies/components/contact-row';
import { ClientStageSelector } from '@/features/client-companies/components/client-stage-selector';
import { de } from '@/lib/i18n/de';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientCompanyId: string }>;
}) {
  const { clientCompanyId } = await params;
  const { orgId } = await requireOrgAdminPage();

  const company = await getClientCompany(orgId, clientCompanyId);
  if (!company) notFound();

  const [contacts, stage] = await Promise.all([
    listClientContacts(orgId, clientCompanyId),
    getClientStage(clientCompanyId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/clients"
          className="text-sm text-primary hover:underline"
        >
          ← {de.clients.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{company.name}</h1>
        <p className="text-sm text-muted-foreground">
          {company.contactEmail ?? '—'} ·{' '}
          {company.isActive ? de.clients.active : de.clients.inactive}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{de.kanban.stage}</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientStageSelector
            clientCompanyId={clientCompanyId}
            currentStage={stage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.clients.inviteContact}</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteContactForm orgId={orgId} clientCompanyId={clientCompanyId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.clients.contacts}</CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {de.clients.noContacts}
            </p>
          ) : (
            <ul className="divide-y">
              {contacts.map((c) => (
                <ContactRow
                  key={c.id}
                  orgId={orgId}
                  clientCompanyId={clientCompanyId}
                  contact={c}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
