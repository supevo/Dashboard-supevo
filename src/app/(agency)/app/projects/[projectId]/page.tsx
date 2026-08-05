import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getProject, listProjectMembers } from '@/features/projects/queries';
import { getBoardView } from '@/features/tasks/queries';
import { KanbanBoard } from '@/features/tasks/components/kanban-board';
import { ProjectCoverUploader } from '@/features/projects/components/project-cover-uploader';
import { EditableProjectTitle } from '@/features/projects/components/editable-project-title';
import { ProjectSettingsButton } from '@/features/projects/components/project-settings-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RecurringTasksSection } from '@/features/recurring/components/recurring-tasks-section';
import { listRecurringTasks } from '@/features/recurring/queries';
import { getProjectHealthMap } from '@/features/clients/health';
import { ClientHealthDot } from '@/features/clients/components/health-dot';
import { listMarketingReports } from '@/features/marketing-reports/queries';
import { ReportsManager } from '@/features/marketing-reports/components/reports-manager';
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

  const [board, members, healthMap] = await Promise.all([
    getBoardView(projectId),
    listProjectMembers(projectId),
    getProjectHealthMap(orgId),
  ]);
  // Recurring tasks: every staff member may SEE them (read-only); only managers
  // get the pause/delete controls.
  const recurring = await listRecurringTasks(projectId);
  // Wochenberichte (SEO/SEA/Anfragen) leben jetzt komplett hier im Projekt.
  const marketingReports = project.clientCompanyId
    ? await listMarketingReports(project.clientCompanyId)
    : [];

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
            <ClientHealthDot health={healthMap.get(projectId)} showLabel />
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
          canAddTask
          canMove
        />
      ) : (
        <p className="text-sm text-muted-foreground">Kein Board vorhanden.</p>
      )}

      {(project.canManage || recurring.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>{de.recurring.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <RecurringTasksSection
              projectId={projectId}
              items={recurring}
              canManage={project.canManage}
            />
          </CardContent>
        </Card>
      )}

      {project.clientCompanyId && (
        <Card>
          <CardHeader>
            <CardTitle>{de.marketingReport.agencyTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportsManager
              clientCompanyId={project.clientCompanyId}
              reports={marketingReports}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
