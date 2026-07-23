'use client';

import { useActionState } from 'react';
import { createClientCompanyAction } from '@/features/client-companies/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

export function CreateClientForm({ orgId }: { orgId: string }) {
  const [state, formAction] = useActionState(
    createClientCompanyAction,
    idleResult,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && (
        <Alert variant="success">{state.message}</Alert>
      )}
      <input type="hidden" name="orgId" value={orgId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">{de.clients.name}</Label>
          <Input id="name" name="name" required />
          {state.status === 'error' && (
            <FieldError errors={state.fieldErrors?.name} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactEmail">{de.clients.contactEmail}</Label>
          <Input id="contactEmail" name="contactEmail" type="email" />
          {state.status === 'error' && (
            <FieldError errors={state.fieldErrors?.contactEmail} />
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">{de.clients.notes}</Label>
        <Textarea id="notes" name="notes" />
      </div>
      <SubmitButton>{de.clients.create}</SubmitButton>
    </form>
  );
}
