'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptSuggestionAction,
  setRequestStatusAction,
  deleteClientRequestAction,
} from '@/features/requests/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/utils';
import { AiTaskDialog } from '@/features/requests/components/ai-task-dialog';
import type { ClientRequest } from '@/features/requests/queries';

function AcceptForm({
  clientCompanyId,
  requestId,
  index,
}: {
  clientCompanyId: string;
  requestId: string;
  index: number;
}) {
  const [state, action] = useActionState(acceptSuggestionAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="index" value={index} />
      <Select name="isInternal" defaultValue="false" className="h-8 w-auto text-xs">
        <option value="true">{de.task.internal}</option>
        <option value="false">{de.task.clientVisible}</option>
      </Select>
      <SubmitButton size="sm">{de.requests.accept}</SubmitButton>
    </form>
  );
}

function DeleteForm({
  clientCompanyId,
  requestId,
}: {
  clientCompanyId: string;
  requestId: string;
}) {
  const [state, action] = useActionState(deleteClientRequestAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(de.requests.deleteConfirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <input type="hidden" name="requestId" value={requestId} />
      <SubmitButton size="sm" variant="ghost">
        {de.requests.delete}
      </SubmitButton>
    </form>
  );
}

function StatusForm({
  clientCompanyId,
  requestId,
  status,
  label,
  variant,
}: {
  clientCompanyId: string;
  requestId: string;
  status: 'dismissed' | 'new';
  label: string;
  variant?: 'ghost' | 'outline';
}) {
  const [state, action] = useActionState(setRequestStatusAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);
  return (
    <form action={action}>
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton size="sm" variant={variant ?? 'ghost'}>
        {label}
      </SubmitButton>
    </form>
  );
}

export function RequestsSection({
  clientCompanyId,
  requests,
}: {
  clientCompanyId: string;
  requests: ClientRequest[];
}) {
  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">{de.requests.empty}</p>;
  }

  return (
    <div className="space-y-4">
      {requests.map((r) => (
        <div key={r.id} className="rounded-md border p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {r.submitterName} · {r.projectName} ·{' '}
              {new Date(r.createdAt).toLocaleDateString('de-DE')}
            </span>
            <span
              className={cn(
                'rounded px-1.5 py-0.5',
                r.status === 'new'
                  ? 'bg-amber-100 text-amber-700'
                  : r.status === 'processed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {de.requests.status[r.status]}
            </span>
          </div>

          <p className="whitespace-pre-wrap text-sm">{r.body}</p>

          {r.suggestions.length > 0 && (
            <div className="mt-3 space-y-2 border-t pt-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {de.requests.suggestions}
              </div>
              {r.suggestions.map((s, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-start justify-between gap-2 rounded bg-muted/40 p-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{s.title}</div>
                    {s.description && (
                      <div className="text-xs text-muted-foreground">
                        {s.description}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {de.priority[s.priority]}
                    </div>
                  </div>
                  {r.status !== 'dismissed' && (
                    <AcceptForm
                      clientCompanyId={clientCompanyId}
                      requestId={r.id}
                      index={i}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {r.suggestions.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {de.requests.noSuggestions}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-1">
            {r.status !== 'dismissed' && (
              <div className="mr-auto">
                <AiTaskDialog clientCompanyId={clientCompanyId} requestId={r.id} />
              </div>
            )}
            {r.status !== 'dismissed' ? (
              <StatusForm
                clientCompanyId={clientCompanyId}
                requestId={r.id}
                status="dismissed"
                label={de.requests.dismiss}
              />
            ) : (
              <StatusForm
                clientCompanyId={clientCompanyId}
                requestId={r.id}
                status="new"
                label={de.requests.reopen}
                variant="outline"
              />
            )}
            <DeleteForm clientCompanyId={clientCompanyId} requestId={r.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
