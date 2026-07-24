import Link from 'next/link';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { can } from '@/lib/authz/policies';
import { listProjects } from '@/features/projects/queries';
import { listClientCompanies } from '@/features/client-companies/queries';
import { CreateProjectDialog } from '@/features/projects/components/create-project-dialog';
import { ProjectCover } from '@/features/projects/components/project-cover';
import { de } from '@/lib/i18n/de';

export default async function ProjectsPage() {
  const { user, orgId } = await requireAgencyPage();
  const canCreate = can(user, { type: 'project.create', orgId });

  const [projects, companies] = await Promise.all([
    listProjects(orgId),
    canCreate ? listClientCompanies(orgId) : Promise.resolve([]),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{de.projects.title}</h1>
        {canCreate && (
          <CreateProjectDialog orgId={orgId} clientCompanies={companies} />
        )}
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">{de.projects.noProjects}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
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
                <p className="font-medium group-hover:text-primary">{p.name}</p>
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
    </div>
  );
}
