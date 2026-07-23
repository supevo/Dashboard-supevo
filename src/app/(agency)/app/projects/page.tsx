import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { can } from '@/lib/authz/policies';
import { listProjects } from '@/features/projects/queries';
import { listClientCompanies } from '@/features/client-companies/queries';
import { CreateProjectForm } from '@/features/projects/components/create-project-form';
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
      <h1 className="text-2xl font-bold">{de.projects.title}</h1>

      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>{de.projects.create}</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateProjectForm orgId={orgId} clientCompanies={companies} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{de.projects.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {de.projects.noProjects}
            </p>
          ) : (
            <ul className="divide-y">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/app/projects/${p.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {companyName.get(p.clientCompanyId) ?? ''} ·{' '}
                      {de.projectStatus[p.status]}
                      {p.isClientVisible
                        ? ` · ${de.projects.clientVisible}`
                        : ` · ${de.projects.internalOnly}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
