'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { editClientRequestAction } from '@/features/requests/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { MyRequest } from '@/features/requests/queries';

function RequestRow({
  request,
  projectId,
}: {
  request: MyRequest;
  projectId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(editClientRequestAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  const statusClass =
    request.status === 'new'
      ? 'bg-amber-100 text-amber-700'
      : request.status === 'processed'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-muted text-muted-foreground';

  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {new Date(request.createdAt).toLocaleDateString('de-DE')}
        </span>
        <span className={cn('rounded px-1.5 py-0.5 text-xs', statusClass)}>
          {de.requests.status[request.status]}
        </span>
      </div>

      {editing ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="projectId" value={projectId} />
          {state.status === 'error' && (
            <Alert variant="destructive">{state.message}</Alert>
          )}
          <Textarea name="body" defaultValue={request.body} rows={4} required />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              {de.common.cancel}
            </button>
            <SubmitButton size="sm">{de.requests.saveEdit}</SubmitButton>
          </div>
        </form>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm">{request.body}</p>
          {request.status === 'new' && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm text-primary hover:underline"
              >
                {de.requests.edit}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function MyRequests({
  projectId,
  requests,
}: {
  projectId: string;
  requests: MyRequest[];
}) {
  if (requests.length === 0) return null;
  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <RequestRow key={r.id} request={r} projectId={projectId} />
      ))}
    </div>
  );
}
