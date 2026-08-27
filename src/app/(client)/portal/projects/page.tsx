import Link from 'next/link';
import { requireClientPage } from '@/lib/authz/page-guards';
import { listProjects } from '@/features/projects/queries';
import { getMyClientCompany } from '@/features/satisfaction/queries';
import { ProjectCover } from '@/features/projects/components/project-cover';
import { ProjectsUpgradeRequired } from '@/features/projects/components/upgrade-required';
import { EmptyState } from '@/components/ui/empty-state';
import { de } from '@/lib/i18n/de';

export default async function PortalProjectsPage() {
  const { orgId } = await requireClientPage();
  const company = await getMyClientCompany();

  // supevo-Smart (Baukasten) hat kein Aufgaben-Board – Upgrade-Hinweis zeigen.
  if (company?.isLegacy) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{de.portal.projects}</h1>
        <ProjectsUpgradeRequired />
      </div>
    );
  }

  const projects = await listProjects(orgId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.portal.projects}</h1>

      {projects.length === 0 ? (
        <EmptyState
          icon="📁"
          title="Noch keine Projekte"
          description="Sobald wir mit einem Projekt für euch starten, erscheint es hier."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/portal/projects/${p.id}`}
              className="group overflow-hidden rounded-lg border bg-card transition hover:shadow-md"
            >
              <ProjectCover projectId={p.id} name={p.name} className="h-32 w-full" />
              <div className="p-3">
                <p className="font-medium group-hover:text-primary">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {de.projectStatus[p.status]}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
