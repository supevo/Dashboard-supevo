'use client';

import { useActionState } from 'react';
import { createInvitationAction } from '@/features/invitations/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

/** Invites a client-side user (role client/guest) already scoped to a
 *  specific client company. */
export function InviteContactForm({
  orgId,
  clientCompanyId,
}: {
  orgId: string;
  clientCompanyId: string;
}) {
  const [state, formAction] = useActionState(createInvitationAction, idleResult);
  const inviteUrl =
    state.status === 'success' && typeof state.data?.inviteUrl === 'string'
      ? state.data.inviteUrl
      : null;

  return (
    <form action={formAction} className="space-y-4">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {inviteUrl && (
        <Alert variant="success">
          <p className="mb-1 font-medium">{de.team.inviteLink}</p>
          <code className="block break-all text-xs">{inviteUrl}</code>
        </Alert>
      )}
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="contactEmailInvite">{de.auth.email}</Label>
          <Input id="contactEmailInvite" name="email" type="email" required />
          {state.status === 'error' && (
            <FieldError errors={state.fieldErrors?.email} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactRole">{de.team.role}</Label>
          <Select id="contactRole" name="role" defaultValue="client">
            <option value="client">{de.roles.client}</option>
            <option value="guest">{de.roles.guest}</option>
          </Select>
        </div>
      </div>
      <SubmitButton>{de.clients.inviteContact}</SubmitButton>
    </form>
  );
}
