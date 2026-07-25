import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getProject, listProjectMembers } from '@/features/projects/queries';
import { getBoardView } from '@/features/tasks/queries';
import { KanbanBoard } from '@/features/tasks/components/kanban-board';
import { ProjectCoverUploader } from '@/features/projects/components/project-cover-uploader';
import { EditableProjectTitle } from '@/features/projects/components/editable-project-title';
import { ProjectSettingsButton } from '@/features/projects/components/project-settings-button';
import { de } from '@/lib/i18n/de';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireAgencyPage();

  const project = await getProject(projectId);
  if (!project) notFound();

  const [board, members] = await Promise.all([
    getBoardView(projectId),
    listProjectMembers(projectId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/projects"
            className="text-sm text-primary hover:underline"
          >
            ← {de.projects.back}
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <EditableProjectTitle
              projectId={projectId}
              name={project.name}
              canManage={project.canManage}
            />
            {project.canManage && <ProjectSettingsButton project={project} />}
          </div>
          <p className="text-sm text-muted-foreground">
            {de.projectStatus[project.status]}
            {project.isClientVisible
              ? ` · ${de.projects.clientVisible}`
              : ` · ${de.projects.internalOnly}`}
          </p>
        </div>
        {project.canManage && (
          <ProjectCoverUploader projectId={projectId} />
        )}
      </div>

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
    </div>
  );
}
