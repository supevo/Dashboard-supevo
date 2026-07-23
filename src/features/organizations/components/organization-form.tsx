'use client';

import { useActionState } from 'react';
import { updateOrganizationAction } from '@/features/organizations/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

export function OrganizationForm({
  orgId,
  name,
}: {
  orgId: string;
  name: string;
}) {
  const [state, formAction] = useActionState(
    updateOrganizationAction,
    idleResult,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && (
        <Alert variant="success">{state.message}</Alert>
      )}
      <input type="hidden" name="orgId" value={orgId} />
      <div className="space-y-2">
        <Label htmlFor="name">{de.settings.orgName}</Label>
        <Input id="name" name="name" defaultValue={name} required />
        {state.status === 'error' && (
          <FieldError errors={state.fieldErrors?.name} />
        )}
      </div>
      <SubmitButton>{de.common.save}</SubmitButton>
    </form>
  );
}
