import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { listClientCompanies } from '@/features/client-companies/queries';
import { CreateClientForm } from '@/features/client-companies/components/create-client-form';
import { getClientHealthMap } from '@/features/clients/health';
import { ClientHealthDot } from '@/features/clients/components/health-dot';
import { de } from '@/lib/i18n/de';

export default async function ClientsPage() {
  const { user, orgId } = await requireAgencyPage();
  const isAdmin = isOrgAdmin(user, orgId);
  const [companies, healthMap] = await Promise.all([
    listClientCompanies(orgId),
    getClientHealthMap(orgId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.clients.title}</h1>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{de.clients.create}</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateClientForm orgId={orgId} />
          </CardContent>
        </Card>
      )}

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
                  <div className="flex items-center gap-2">
                    <ClientHealthDot health={healthMap.get(c.id)} />
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
