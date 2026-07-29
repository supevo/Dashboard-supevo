import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { getTaskDetail } from '@/features/tasks/queries';
import { listTaskComments } from '@/features/comments/queries';
import { listTaskFiles } from '@/features/files/queries';
import { listTaskLabels } from '@/features/labels/queries';
import { LabelChip } from '@/components/ui/label-chip';
import { listProjectApprovals } from '@/features/approvals/queries';
import { CommentForm } from '@/features/comments/components/comment-form';
import { CommentItem } from '@/features/comments/components/comment-item';
import { FileUploader } from '@/features/files/components/file-uploader';
import { FileItem } from '@/features/files/components/file-item';
import { DecideApprovalForm } from '@/features/approvals/components/decide-approval-form';
import { getMyClientRating, isTaskDone } from '@/features/client-ratings/queries';
import { ClientRatingPanel } from '@/features/client-ratings/components/client-rating-panel';
import { ClientBriefingEditor } from '@/features/tasks/components/client-briefing-editor';
import { de } from '@/lib/i18n/de';

export default async function PortalTaskPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;
  const { user } = await requireClientPage();

  // RLS returns the task only if it is client-visible (is_internal = false).
  const task = await getTaskDetail(taskId);
  if (!task || task.projectId !== projectId) notFound();

  const [comments, files, approvals, labels, myRating, isDone] = await Promise.all([
    listTaskComments(taskId, user.id),
    listTaskFiles(taskId, user.id),
    listProjectApprovals(projectId),
    listTaskLabels(taskId),
    getMyClientRating(taskId, user.id),
    isTaskDone(taskId),
  ]);
  const pending = approvals.filter(
    (a) => a.taskId === taskId && a.status === 'pending',
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={`/portal/projects/${projectId}`}
          className="text-sm text-primary hover:underline"
        >
          ← {de.portal.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{task.title}</h1>
        {labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {labels.map((l) => (
              <LabelChip key={l.id} name={l.name} color={l.color} intensity={l.intensity} />
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{de.task.description}</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientBriefingEditor
            projectId={projectId}
            taskId={taskId}
            description={task.description}
          />
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{de.approvals.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pending.map((a) => (
              <div key={a.id}>
                <div className="mb-2 font-medium">{a.title}</div>
                <DecideApprovalForm approvalId={a.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isDone && (
        <Card>
          <CardHeader>
            <CardTitle>⭐ Ihre Bewertung</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientRatingPanel taskId={taskId} projectId={projectId} initial={myRating} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{de.portal.files}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FileUploader
            projectId={projectId}
            taskId={taskId}
            allowInternal={false}
          />
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
                  area="portal"
                  currentUserId={user.id}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{de.portal.feedback}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CommentForm
            orgId={task.organizationId}
            projectId={projectId}
            taskId={taskId}
            allowInternal={false}
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
