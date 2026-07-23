import { notFound, redirect } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getTaskDetail } from '@/features/tasks/queries';

/** Deep-link resolver: notifications reference a task by id; this redirects to
 *  the full task URL (which needs the project id). */
export default async function TaskRedirectPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  await requireAgencyPage();
  const task = await getTaskDetail(taskId);
  if (!task) notFound();
  redirect(`/app/projects/${task.projectId}/tasks/${taskId}`);
}
