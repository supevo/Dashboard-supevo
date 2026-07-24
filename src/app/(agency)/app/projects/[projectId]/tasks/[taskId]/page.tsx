import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getTaskDetail } from '@/features/tasks/queries';
import { listProjectMembers } from '@/features/projects/queries';
import { AssigneePicker } from '@/features/tasks/components/assignee-picker';
import { listTaskComments } from '@/features/comments/queries';
import { listTaskFiles } from '@/features/files/queries';
import { listTaskChecklists } from '@/features/checklists/queries';
import { CommentForm } from '@/features/comments/components/comment-form';
import { CommentItem } from '@/features/comments/components/comment-item';
import { FileUploader } from '@/features/files/components/file-uploader';
import { FileItem } from '@/features/files/components/file-item';
import { ChecklistSection } from '@/features/checklists/components/checklist-section';
import { listLabels, listTaskLabels } from '@/features/labels/queries';
import { LabelPicker } from '@/features/labels/components/label-picker';
import { StartTimerButton } from '@/features/time-tracking/components/start-timer-button';
import { BriefingEditor } from '@/features/tasks/components/briefing-editor';
import { ArchiveTaskButton } from '@/features/tasks/components/archive-task-button';
import { listProjectApprovals } from '@/features/approvals/queries';
import { RequestApprovalForm } from '@/features/approvals/components/request-approval-form';
import { formatMinutes } from '@/lib/time';
import { de } from '@/lib/i18n/de';

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;
  const { user } = await requireAgencyPage();

  const task = await getTaskDetail(taskId);
  if (!task || task.projectId !== projectId) notFound();

  const [comments, files, checklists, orgLabels, taskLabels, approvals] =
    await Promise.all([
      listTaskComments(taskId, user.id),
      listTaskFiles(taskId, user.id),
      listTaskChecklists(taskId),
      listLabels(task.organizationId),
      listTaskLabels(taskId),
      listProjectApprovals(projectId),
    ]);
  const members = await listProjectMembers(projectId);
  const taskApprovals = approvals.filter((a) => a.taskId === taskId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href={`/app/projects/${projectId}`}
          className="text-sm text-primary hover:underline"
        >
          ← {de.task.backToBoard}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{task.title}</h1>
        <p className="text-sm text-muted-foreground">
          {de.priority[task.priority]}
          {task.isInternal ? ` · ${de.kanban.internal}` : ''}
          {` · ${de.time.taskTime}: ${formatMinutes(task.actualMinutes)}`}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StartTimerButton projectId={projectId} taskId={taskId} />
          {task.canManage && (
            <ArchiveTaskButton
              projectId={projectId}
              taskId={taskId}
              isArchived={task.isArchived}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Main column: content work */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Briefing</CardTitle>
            </CardHeader>
            <CardContent>
              <BriefingEditor
                projectId={projectId}
                taskId={taskId}
                description={task.description}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.task.checklists}</CardTitle>
            </CardHeader>
            <CardContent>
              <ChecklistSection
                ctx={{ orgId: task.organizationId, projectId, taskId }}
                checklists={checklists}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.task.files}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FileUploader projectId={projectId} taskId={taskId} />
              {files.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {de.task.noFiles}
                </p>
              ) : (
                <ul className="divide-y">
                  {files.map((f) => (
                    <FileItem
                      key={f.id}
                      file={f}
                      projectId={projectId}
                      taskId={taskId}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.task.comments}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CommentForm
                orgId={task.organizationId}
                projectId={projectId}
                taskId={taskId}
              />
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {de.task.noComments}
                </p>
              ) : (
                <div className="space-y-2">
                  {comments.map((c) => (
                    <CommentItem key={c.id} comment={c} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Nebenblock: responsibilities, labels & approvals */}
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Verantwortliche</CardTitle>
            </CardHeader>
            <CardContent>
              <AssigneePicker
                projectId={projectId}
                taskId={taskId}
                assignees={task.assignees}
                members={members}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.labels.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <LabelPicker
                orgId={task.organizationId}
                projectId={projectId}
                taskId={taskId}
                assigned={taskLabels}
                available={orgLabels}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.approvals.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {taskApprovals.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {taskApprovals.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <span>{a.title}</span>
                      <span className="text-muted-foreground">
                        {de.approvals[a.status]}
                        {a.decisionComment ? ` · ${a.decisionComment}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <RequestApprovalForm
                projectId={projectId}
                taskId={taskId}
                defaultTitle={task.title}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
