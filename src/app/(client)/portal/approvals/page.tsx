import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireClientPage } from '@/lib/authz/page-guards';
import { listPendingApprovals } from '@/features/approvals/queries';
import { DecideApprovalForm } from '@/features/approvals/components/decide-approval-form';
import { de } from '@/lib/i18n/de';

export default async function PortalApprovalsPage() {
  await requireClientPage();
  const approvals = await listPendingApprovals();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{de.approvals.title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{de.approvals.pending}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {approvals.length === 0 ? (
            <p className="text-sm text-muted-foreground">{de.approvals.none}</p>
          ) : (
            approvals.map((a) => (
              <div key={a.id} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">{a.title}</span>
                  <Link
                    href={`/portal/projects/${a.projectId}/tasks/${a.taskId}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {de.portal.open}
                  </Link>
                </div>
                <DecideApprovalForm approvalId={a.id} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
