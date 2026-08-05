import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getTaskDetail } from '@/features/tasks/queries';
import { listProjectMembers } from '@/features/projects/queries';
import { AssigneePicker } from '@/features/tasks/components/assignee-picker';
import { ClientNotifyButton } from '@/features/tasks/components/client-notify-button';
import { AutoAssignButton } from '@/features/tasks/components/auto-assign-button';
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
import { getRunningTimer } from '@/features/time-tracking/queries';
import { TaskRating } from '@/features/ratings/components/task-rating';
import { getTaskRating } from '@/features/ratings/queries';
import { TaskKudosPanel } from '@/features/task-kudos/components/task-kudos-panel';
import { getTaskKudos } from '@/features/task-kudos/queries';
import { getTaskClientRating } from '@/features/client-ratings/queries';
import { TaskViewTracker } from '@/features/tasks/components/task-view-tracker';
import { TaskActivityLog } from '@/features/tasks/components/task-activity-log';
import { listTaskActivity, getTaskViewStats } from '@/features/tasks/activity';
import { EffortPanel } from '@/features/estimate/components/effort-panel';
import { getTaskActualMinutes } from '@/features/estimate/queries';
import { BriefingEditor } from '@/features/tasks/components/briefing-editor';
import { ArchiveTaskButton } from '@/features/tasks/components/archive-task-button';
import { DueDateEditor } from '@/features/tasks/components/due-date-editor';
import { VisibilityEditor } from '@/features/tasks/components/visibility-editor';
import { EditableTaskTitle } from '@/features/tasks/components/editable-task-title';
import { PrintBillingCard } from '@/features/print-billing/components/print-billing-card';
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
  const runningTimer = await getRunningTimer(user.id);
  const rating = await getTaskRating(taskId, user.id);
  const taskKudos = await getTaskKudos(taskId, user.id);
  const clientRating = await getTaskClientRating(taskId);
  const actualMinutes = await getTaskActualMinutes(taskId);
  const [taskActivity, taskViewStats] = await Promise.all([
    listTaskActivity(taskId),
    getTaskViewStats(taskId),
  ]);
  const isAssignee = task.assignees.some((a) => a.userId === user.id);
  const taskApprovals = approvals.filter((a) => a.taskId === taskId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <TaskViewTracker taskId={taskId} />
      <div>
        <Link
          href={`/app/projects/${projectId}`}
          className="text-sm text-primary hover:underline"
        >
          ← {de.task.backToBoard}
        </Link>
        <div className="mt-2">
          <EditableTaskTitle
            projectId={projectId}
            taskId={taskId}
            title={task.title}
            canManage
          />
        </div>
        {task.isExpress && (
          <span className="express-pulse mt-2 inline-flex items-center gap-1 rounded-full border border-violet-500 px-2.5 py-1 text-xs font-semibold text-violet-600 dark:text-violet-300">
            🚀 Express-Aufgabe – vorgezogen
          </span>
        )}
        <p className="text-sm text-muted-foreground">
          {de.priority[task.priority]}
          {task.isInternal ? ` · ${de.kanban.internal}` : ''}
          {` · ${de.time.taskTime}: ${formatMinutes(task.actualMinutes)}`}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StartTimerButton
            projectId={projectId}
            taskId={taskId}
            runningForThisTask={runningTimer?.taskId === taskId}
          />
          {task.canManage && (
            <ArchiveTaskButton
              projectId={projectId}
              taskId={taskId}
              isArchived={task.isArchived}
            />
          )}
          {!task.isInternal && (
            <ClientNotifyButton
              taskId={taskId}
              notified={Boolean(task.clientNotifiedAt)}
              variant="card"
            />
          )}
        </div>
      </div>

      {(task.printBillingStatus === 'required' ||
        task.printBillingStatus === 'settled') && (
        <PrintBillingCard
          taskId={taskId}
          status={task.printBillingStatus === 'settled' ? 'settled' : 'required'}
        />
      )}

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
                      area="app"
                      currentUserId={user.id}
                    />
                  ))}
                </ul>
              )}
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
              <CardTitle>{de.task.comments}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CommentForm
                orgId={task.organizationId}
                projectId={projectId}
                taskId={taskId}
                members={members}
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
              <CardTitle>{de.task.visibility}</CardTitle>
            </CardHeader>
            <CardContent>
              {task.canManage ? (
                <VisibilityEditor
                  projectId={projectId}
                  taskId={taskId}
                  isInternal={task.isInternal}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {task.isInternal ? de.task.internal : de.task.clientVisible}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.task.dueDate}</CardTitle>
            </CardHeader>
            <CardContent>
              <DueDateEditor
                projectId={projectId}
                taskId={taskId}
                dueDate={task.dueDate}
              />
            </CardContent>
          </Card>

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
              {task.canManage && (
                <div className="mt-3 border-t pt-3">
                  <AutoAssignButton projectId={projectId} taskId={taskId} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.effort.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <EffortPanel
                projectId={projectId}
                taskId={taskId}
                estimatedMinutes={task.estimatedMinutes}
                actualMinutes={actualMinutes}
                canManage={task.canManage}
              />
            </CardContent>
          </Card>

          {clientRating && (
            <Card>
              <CardHeader>
                <CardTitle>⭐ Kundenbewertung</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-lg text-amber-400" aria-label={`${clientRating.stars} von 5 Sternen`}>
                  {'★'.repeat(clientRating.stars)}
                  <span className="text-muted-foreground/30">{'★'.repeat(5 - clientRating.stars)}</span>
                </div>
                {clientRating.comment && (
                  <p className="text-sm text-muted-foreground">„{clientRating.comment}“</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {clientRating.raterName} · {new Date(clientRating.createdAt).toLocaleDateString('de-DE')}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{de.taskKudos.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskKudosPanel projectId={projectId} taskId={taskId} info={taskKudos} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{de.rating.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskRating
                projectId={projectId}
                taskId={taskId}
                summary={rating}
                canRate={!isAssignee}
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

          <Card>
            <CardHeader>
              <CardTitle>{de.taskLog.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{de.taskLog.subtitle}</p>
            </CardHeader>
            <CardContent>
              <TaskActivityLog activity={taskActivity} viewStats={taskViewStats} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
