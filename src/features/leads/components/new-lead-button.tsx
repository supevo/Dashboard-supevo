'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createLeadAction } from '@/features/leads/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';

export function NewLeadButton() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createLeadAction, idleResult);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

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
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        + {de.leads.newLead}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={de.leads.newLead}>
        <form ref={formRef} action={action} className="space-y-3">
          {state.status === 'error' && (
            <Alert variant="destructive">{state.message}</Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="l-name">{de.leads.contactName}</Label>
              <Input id="l-name" name="contactName" required autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="l-company">{de.leads.company}</Label>
              <Input id="l-company" name="company" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="l-email">{de.leads.email}</Label>
              <Input id="l-email" name="email" type="email" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="l-phone">{de.leads.phone}</Label>
              <Input id="l-phone" name="phone" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="l-source">{de.leads.source}</Label>
              <Input id="l-source" name="source" placeholder={de.leads.sourcePlaceholder} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="l-value">{de.leads.value}</Label>
              <Input id="l-value" name="value" placeholder="z. B. 2500" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="l-note">{de.leads.note}</Label>
            <Textarea id="l-note" name="note" rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {de.common.cancel}
            </button>
            <SubmitButton>{de.leads.save}</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
