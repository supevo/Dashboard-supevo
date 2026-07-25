'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  createRecapDraftAction,
  sendRecapAction,
} from '@/features/recap/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';

export function RecapSection({
  clientCompanyId,
}: {
  clientCompanyId: string;
}) {
  const [draftState, draftAction] = useActionState(
    createRecapDraftAction,
    idleResult,
  );
  const [sendState, sendAction] = useActionState(sendRecapAction, idleResult);
  const [body, setBody] = useState('');
  const [noActivity, setNoActivity] = useState(false);

  useEffect(() => {
    if (draftState.status === 'success') {
      const hasActivity = draftState.data?.hasActivity === true;
      setNoActivity(!hasActivity);
      if (hasActivity && typeof draftState.data?.draft === 'string') {
        setBody(draftState.data.draft);
      }
    }
  }, [draftState]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{de.recap.hint}</p>

      <form action={draftAction}>
        <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
        <SubmitButton size="sm" variant="outline">
          {de.recap.createDraft}
        </SubmitButton>
      </form>

      {draftState.status === 'error' && (
        <Alert variant="destructive">{draftState.message}</Alert>
      )}

      {noActivity && (
        <Alert variant="default">{de.recap.noActivity}</Alert>
      )}

      {body && (
        <form action={sendAction} className="space-y-2">
          <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {de.recap.draft}
          </label>
          <Textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
          />
          {sendState.status === 'error' && (
            <Alert variant="destructive">{sendState.message}</Alert>
          )}
          {sendState.status === 'success' && (
            <Alert variant="success">{sendState.message}</Alert>
          )}
          <div className="flex justify-end">
            <SubmitButton size="sm">{de.recap.send}</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
