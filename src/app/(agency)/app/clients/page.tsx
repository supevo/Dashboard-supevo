import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isOrgAdmin } from '@/lib/authz/policies';
import { listClientCompanies } from '@/features/client-companies/queries';
import { getClientHealthMap } from '@/features/clients/health';
import { ClientHealthDot } from '@/features/clients/components/health-dot';
import { listProjects } from '@/features/projects/queries';
import { ProjectCover } from '@/features/projects/components/project-cover';
import { de } from '@/lib/i18n/de';

export default async function ClientsPage() {
  const { user, orgId } = await requireAgencyPage();
  const isAdmin = isOrgAdmin(user, orgId);
  const [companies, healthMap, projects] = await Promise.all([
    listClientCompanies(orgId),
    getClientHealthMap(orgId),
    listProjects(orgId),
  ]);

  // Cover per client = its primary (oldest) board's cover. listProjects is
  // ordered newest-first, so overwriting leaves the oldest project per client.
  const primaryProject = new Map<
    string,
    { id: string; name: string; coverUpdatedAt: string | null }
  >();
  for (const p of projects) {
    primaryProject.set(p.clientCompanyId, {
      id: p.id,
      name: p.name,
      coverUpdatedAt: p.coverUpdatedAt,
    });
  }

  // Legacy clients (Bestandskunden) get their own compact section below the
  // regular clients. Sie laufen über den Modul-Baukasten + Custompreis.
  const normalCompanies = companies.filter((c) => !c.isLegacy);
  const legacyCompanies = companies.filter((c) => c.isLegacy);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{de.clients.title}</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/app/clients/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Neuer Kunde
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

      {companies.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground">{de.clients.noClients}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {normalCompanies.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {normalCompanies.map((c) => {
                const cover = primaryProject.get(c.id);
                return (
                  <Link
                    key={c.id}
                    href={`/app/clients/${c.id}`}
                    className="group flex flex-col overflow-hidden rounded-lg border bg-card transition hover:border-primary/40 hover:shadow-md"
                  >
                    {cover ? (
                      <ProjectCover
                        projectId={cover.id}
                        name={c.name}
                        version={cover.coverUpdatedAt}
                        className="h-32 w-full rounded-none"
                      />
                    ) : (
                      <div className="flex h-32 w-full items-center justify-center bg-primary/15 text-primary">
                        <span className="text-2xl font-semibold">
                          {c.name.trim().charAt(0).toUpperCase() || '#'}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold group-hover:text-primary">
                          {c.name}
                        </p>
                        <ClientHealthDot health={healthMap.get(c.id)} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
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
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {legacyCompanies.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  🏛️ supevo Smart
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({legacyCompanies.length})
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {legacyCompanies.map((c) => {
                  const cover = primaryProject.get(c.id);
                  return (
                    <Link
                      key={c.id}
                      href={`/app/clients/${c.id}`}
                      className="group flex items-center gap-3 rounded-md border bg-card px-3 py-2 transition hover:shadow-sm"
                    >
                      {cover ? (
                        <ProjectCover
                          projectId={cover.id}
                          name={c.name}
                          version={cover.coverUpdatedAt}
                          className="h-10 w-14 shrink-0 rounded"
                        />
                      ) : (
                        <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-primary/15 text-primary">
                          <span className="text-sm font-semibold">
                            {c.name.trim().charAt(0).toUpperCase() || '#'}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium group-hover:text-primary">
                            {c.name}
                          </p>
                          {/* Legacy clients are not on the fair-share traffic light. */}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          supevo Smart
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
