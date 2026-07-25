'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientTaskAction } from '@/features/tasks/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';

/**
 * Portal button that lets a client add a task with just a title and briefing.
 * Due date and internal visibility are intentionally omitted — those are
 * agency-only. The task is always created client-visible.
 */
export function AddClientTask({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    createClientTaskAction,
    idleResult,
  );
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"
      >
        + {de.portal.addTask}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={de.portal.addTask}>
        <form ref={formRef} action={formAction} className="space-y-4">
          <input type="hidden" name="projectId" value={projectId} />

          <div className="space-y-1">
            <Label htmlFor="title">{de.kanban.taskTitle}</Label>
            <Input id="title" name="title" required autoFocus />
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Briefing</Label>
            <Textarea id="description" name="description" rows={4} />
          </div>

          {state.status === 'error' && (
            <p className="text-xs text-destructive">{state.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {de.common.cancel}
            </button>
            <SubmitButton>{de.portal.addTask}</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
