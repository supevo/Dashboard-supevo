import { requireClientPage } from '@/lib/authz/page-guards';
import { listMyIdeas, listMyIdeaProjects } from '@/features/ideas/queries';
import { IdeasBoard } from '@/features/ideas/components/ideas-board';

export const dynamic = 'force-dynamic';

export default async function PortalIdeasPage() {
  await requireClientPage();
  const [ideas, projects] = await Promise.all([
    listMyIdeas(),
    listMyIdeaProjects(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ideen-Board</h1>
        <p className="text-sm text-muted-foreground">
          Sammelt eure Ideen und schiebt sie mit einem Klick in die Umsetzung.
        </p>
      </div>
      <IdeasBoard ideas={ideas} projects={projects} />
    </div>
  );
}
