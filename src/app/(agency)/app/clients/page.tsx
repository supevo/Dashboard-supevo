import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrgAdminPage } from '@/lib/authz/page-guards';
import { listClientCompanies } from '@/features/client-companies/queries';
import { CreateClientForm } from '@/features/client-companies/components/create-client-form';
import { de } from '@/lib/i18n/de';

export default async function ClientsPage() {
  const { orgId } = await requireOrgAdminPage();
  const companies = await listClientCompanies(orgId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.clients.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{de.clients.create}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateClientForm orgId={orgId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.clients.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {de.clients.noClients}
            </p>
          ) : (
            <ul className="divide-y">
              {companies.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <Link
                      href={`/app/clients/${c.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {c.contactEmail ?? '—'}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {c.isActive ? de.clients.active : de.clients.inactive}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
