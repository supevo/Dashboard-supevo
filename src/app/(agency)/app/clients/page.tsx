import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{de.clients.title}</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/app/clients/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Neuer Kunde (geführt)
          </Link>
          {isAdmin && (
            <Link
              href="/app/clients/import"
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              ✨ {de.clientImport.open}
            </Link>
          )}
        </div>
      </div>

      {/* Schnellanlage (nur Stammdaten) – der geführte Flow oben führt durch
          Kunde → Mitgliedschaft → Vertrag. */}
      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          {de.clients.create} (schnell, nur Stammdaten)
        </summary>
        <div className="border-t p-4">
          <CreateClientForm orgId={orgId} />
        </div>
      </details>

      {companies.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground">{de.clients.noClients}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/app/clients/${c.id}`}
              className="group flex flex-col justify-between rounded-lg border bg-card p-4 transition hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold group-hover:text-primary">{c.name}</p>
                <ClientHealthDot health={healthMap.get(c.id)} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {c.contactEmail ?? '—'}
                </span>
                <span
                  className={
                    c.isActive
                      ? 'shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400'
                      : 'shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'
                  }
                >
                  {c.isActive ? de.clients.active : de.clients.inactive}
                </span>
              </div>
              <span className="mt-3 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                Board öffnen →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
