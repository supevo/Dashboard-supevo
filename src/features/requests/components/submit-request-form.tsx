'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { submitClientRequestAction } from '@/features/requests/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';

/** Portal: a client submits a free-text briefing; the agency + AI take it from there. */
export function SubmitRequestForm({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    submitClientRequestAction,
    idleResult,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      const t = setTimeout(() => setOpen(false), 1200);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"
      >
        {de.requests.submit}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={de.requests.submit}>
        <form ref={formRef} action={formAction} className="space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          <p className="text-sm text-muted-foreground">{de.requests.hint}</p>
          {state.status === 'error' && (
            <Alert variant="destructive">{state.message}</Alert>
          )}
          {state.status === 'success' && (
            <Alert variant="success">{state.message}</Alert>
          )}
          <Textarea
            name="body"
            required
            rows={6}
            placeholder={de.requests.placeholder}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {de.common.cancel}
            </button>
            <SubmitButton>{de.requests.send}</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
