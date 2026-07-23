import { notFound, redirect } from 'next/navigation';
import { requireClientPage } from '@/lib/authz/page-guards';
import { getTaskDetail } from '@/features/tasks/queries';

/** Portal deep-link resolver for task notifications. */
export default async function PortalTaskRedirectPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  await requireClientPage();
  const task = await getTaskDetail(taskId);
  if (!task) notFound();
  redirect(`/portal/projects/${task.projectId}/tasks/${taskId}`);
}
