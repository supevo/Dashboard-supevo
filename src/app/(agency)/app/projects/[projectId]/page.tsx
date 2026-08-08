import { notFound, redirect } from 'next/navigation';
import { requireAgencyPage } from '@/lib/authz/page-guards';
import { getProject } from '@/features/projects/queries';

/**
 * A project is now a board inside its client. This former project page redirects
 * to the merged client view with the matching board pre-selected. Task deep
 * links (/app/projects/[id]/tasks/[taskId]) keep working via their own route.
 */
export default async function ProjectRedirectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireAgencyPage();

  const project = await getProject(projectId);
  if (!project?.clientCompanyId) notFound();

  redirect(
    `/app/clients/${project.clientCompanyId}?tab=board&board=${projectId}`,
  );
}
