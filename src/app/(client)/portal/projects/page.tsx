import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { listProjects } from '@/features/projects/queries';
import { de } from '@/lib/i18n/de';

export default async function PortalProjectsPage() {
  const { orgId } = await requireClientPage();
  const projects = await listProjects(orgId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.portal.projects}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{de.portal.projects}</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {de.portal.noProjects}
            </p>
          ) : (
            <ul className="divide-y">
              {projects.map((p) => (
                <li key={p.id} className="py-3">
                  <Link
                    href={`/portal/projects/${p.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {p.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {de.projectStatus[p.status]}
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
