import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import {
  getProject,
  listProjectMembers,
} from '@/features/projects/queries';
import { getBoardView } from '@/features/tasks/queries';
import { KanbanBoard } from '@/features/tasks/components/kanban-board';
import { StageSelector } from '@/features/tasks/components/stage-selector';
import { ProjectSettingsForm } from '@/features/projects/components/project-settings-form';
import { de } from '@/lib/i18n/de';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { orgId } = await requireAgencyPage();

  const project = await getProject(projectId);
  if (!project) notFound();

  const [board, members] = await Promise.all([
    getBoardView(projectId),
    listProjectMembers(projectId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/projects"
          className="text-sm text-primary hover:underline"
        >
          ← {de.projects.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{project.name}</h1>
        <p className="text-sm text-muted-foreground">
          {de.projectStatus[project.status]}
          {project.isClientVisible
            ? ` · ${de.projects.clientVisible}`
            : ` · ${de.projects.internalOnly}`}
        </p>
      </div>

      {project.canManage && board && (
        <Card>
          <CardHeader>
            <CardTitle>{de.kanban.stage}</CardTitle>
          </CardHeader>
          <CardContent>
            <StageSelector
              projectId={projectId}
              currentStage={
                board.columns.find((c) => c.columnKey === 'active')?.wipLimit ??
                2
              }
            />
          </CardContent>
        </Card>
      )}

      {board ? (
        <KanbanBoard
          projectId={projectId}
          board={board}
          members={members}
          canManage={project.canManage}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Kein Board vorhanden.</p>
      )}

      {project.canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Projekteinstellungen</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectSettingsForm orgId={orgId} project={project} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
