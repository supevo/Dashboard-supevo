import Link from 'next/link';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { can } from '@/lib/authz/policies';
import { listProjects } from '@/features/projects/queries';
import { listClientCompanies } from '@/features/client-companies/queries';
import { getLegacyClientPackages } from '@/features/legacy/queries';
import { LEGACY_PACKAGE_INFO } from '@/features/legacy/packages';
import { CreateProjectDialog } from '@/features/projects/components/create-project-dialog';
import { ProjectCover } from '@/features/projects/components/project-cover';
import { getProjectHealthMap } from '@/features/clients/health';
import { ClientHealthDot } from '@/features/clients/components/health-dot';
import { de } from '@/lib/i18n/de';

export default async function ProjectsPage() {
  const { user, orgId } = await requireAgencyPage();
  const canCreate = can(user, { type: 'project.create', orgId });

  const [projects, companies, healthMap, legacyPackages] = await Promise.all([
    listProjects(orgId),
    canCreate ? listClientCompanies(orgId) : Promise.resolve([]),
    getProjectHealthMap(orgId),
    getLegacyClientPackages(orgId),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  // Legacy clients' projects go into a separate, more compact section below.
  const normalProjects = projects.filter(
    (p) => !legacyPackages.has(p.clientCompanyId),
  );
  const legacyProjects = projects.filter((p) =>
    legacyPackages.has(p.clientCompanyId),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{de.projects.title}</h1>
        {canCreate && (
          <CreateProjectDialog orgId={orgId} clientCompanies={companies} />
        )}
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">{de.projects.noProjects}</p>
      ) : (
        <>
          {normalProjects.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {normalProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/app/projects/${p.id}`}
                  className="group overflow-hidden rounded-lg border bg-card transition hover:shadow-md"
                >
                  <ProjectCover
                    projectId={p.id}
                    name={p.name}
                    className="h-32 w-full"
                  />
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium group-hover:text-primary">
                        {p.name}
                      </p>
                      <ClientHealthDot health={healthMap.get(p.id)} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {companyName.get(p.clientCompanyId) ?? ''} ·{' '}
                      {de.projectStatus[p.status]}
                      {p.isClientVisible
                        ? ` · ${de.projects.clientVisible}`
                        : ` · ${de.projects.internalOnly}`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {legacyProjects.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  🏛️ Legacy-Kunden
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({legacyProjects.length})
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {legacyProjects.map((p) => {
                  const pkg = legacyPackages.get(p.clientCompanyId);
                  return (
                    <Link
                      key={p.id}
                      href={`/app/projects/${p.id}`}
                      className="group flex items-center gap-3 rounded-md border bg-card px-3 py-2 transition hover:shadow-sm"
                    >
                      <ProjectCover
                        projectId={p.id}
                        name={p.name}
                        className="h-10 w-14 shrink-0 rounded"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium group-hover:text-primary">
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {companyName.get(p.clientCompanyId) ?? ''}
                          {pkg ? ` · ${LEGACY_PACKAGE_INFO[pkg].label}` : ''}
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
