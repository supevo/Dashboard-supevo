import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getTaskDetail } from '@/features/tasks/queries';
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

  const [comments, files, checklists, orgLabels, taskLabels] =
    await Promise.all([
      listTaskComments(taskId, user.id),
      listTaskFiles(taskId, user.id),
      listTaskChecklists(taskId),
      listLabels(task.organizationId),
      listTaskLabels(taskId),
    ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
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
          {task.assignees.length > 0 &&
            ` · ${task.assignees.map((a) => a.name).join(', ')}`}
          {` · ${de.time.taskTime}: ${formatMinutes(task.actualMinutes)}`}
        </p>
        <div className="mt-3">
          <StartTimerButton projectId={projectId} taskId={taskId} />
        </div>
      </div>

      {task.description && (
        <Card>
          <CardHeader>
            <CardTitle>{de.task.description}</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: task.description }}
            />
          </CardContent>
        </Card>
      )}

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
            <p className="text-sm text-muted-foreground">{de.task.noFiles}</p>
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
            <p className="text-sm text-muted-foreground">{de.task.noComments}</p>
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
  );
}
