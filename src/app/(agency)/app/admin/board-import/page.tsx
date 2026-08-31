import { redirect } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { isSuperAdmin } from '@/lib/authz/policies';
import { listProjects } from '@/features/projects/queries';
import { BoardImportForm } from '@/features/board-import/components/board-import-form';

export const dynamic = 'force-dynamic';

/** Temporary super-admin tool to migrate an old board (CSV) into a project. */
export default async function BoardImportPage() {
  const { user, orgId } = await requireAgencyPage();
  if (!isSuperAdmin(user)) redirect('/forbidden');

  const projects = await listProjects(orgId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📦 Board-Import (temporär)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Migriere Aufgaben – inklusive Kommentaren – aus einem alten Board.
          Exportiere das alte Board als <strong>CSV</strong> (Spalten:
          Aufgabe, Beschreibung, Kommentare) und lade es hier hoch. Nur für
          Super-Admins.
        </p>
      </div>
      <BoardImportForm
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
