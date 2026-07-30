import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { getProject } from '@/features/projects/queries';
import { getBoardView } from '@/features/tasks/queries';
import { listProjectApprovals } from '@/features/approvals/queries';
import { DecideApprovalForm } from '@/features/approvals/components/decide-approval-form';
import { ExpressBoard } from '@/features/express/components/express-board';
import { getExpressStatus } from '@/features/express/queries';
import { AddClientTask } from '@/features/tasks/components/add-client-task';
import { SubmitRequestForm } from '@/features/requests/components/submit-request-form';
import { listClientRecurringTasks } from '@/features/recurring/queries';
import { de } from '@/lib/i18n/de';

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireClientPage();

  const project = await getProject(projectId);
  if (!project) notFound();

  const [board, approvals, expressStatus, recurring] = await Promise.all([
    getBoardView(projectId),
    listProjectApprovals(projectId),
    getExpressStatus(project.clientCompanyId),
    listClientRecurringTasks(projectId),
  ]);

  // Flatten client-visible tasks (RLS already removed internal ones).
  const tasks = (board?.columns ?? []).flatMap((col) =>
    col.tasks.map((t) => ({ ...t, columnName: col.name })),
  );
  const pending = approvals.filter((a) => a.status === 'pending');

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/projects" className="text-sm text-primary hover:underline">
          ← {de.portal.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{project.name}</h1>
      </div>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{de.approvals.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pending.map((a) => (
              <div key={a.id} className="rounded-md border p-3">
                <div className="mb-2 font-medium">{a.title}</div>
                <DecideApprovalForm approvalId={a.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{de.portal.tasks}</CardTitle>
          <div className="flex gap-2">
            <SubmitRequestForm projectId={projectId} />
            <AddClientTask projectId={projectId} />
          </div>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 || !board ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {de.portal.noTasks}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                {de.portal.reorderHint}
              </p>
              <ExpressBoard
                projectId={projectId}
                board={board}
                status={expressStatus}
              />
            </>
          )}
        </CardContent>
      </Card>

      {recurring.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dauerhafte Aufgaben an denen wir aktuell arbeiten</CardTitle>
            <p className="text-sm text-muted-foreground">
              Diese Leistungen erbringen wir wiederkehrend für euch – auch ohne
              neue Aufgabe von eurer Seite.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {recurring.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    🔁 {r.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.scheduleLabel}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
