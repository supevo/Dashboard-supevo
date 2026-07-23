'use client';

import { useActionState } from 'react';
import { createInvitationAction } from '@/features/invitations/actions';
import { INVITABLE_ROLES } from '@/features/invitations/schema';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

interface Company {
  id: string;
  name: string;
}

export function InviteForm({
  orgId,
  clientCompanies,
}: {
  orgId: string;
  clientCompanies: Company[];
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
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-1">
          <Label htmlFor="email">{de.auth.email}</Label>
          <Input id="email" name="email" type="email" required />
          {state.status === 'error' && (
            <FieldError errors={state.fieldErrors?.email} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">{de.team.role}</Label>
          <Select id="role" name="role" defaultValue="employee">
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {de.roles[role]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="clientCompanyId">{de.clients.title}</Label>
          <Select id="clientCompanyId" name="clientCompanyId" defaultValue="">
            <option value="">— (nur für Kundenrollen)</option>
            {clientCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {state.status === 'error' && (
            <FieldError errors={state.fieldErrors?.clientCompanyId} />
          )}
        </div>
      </div>
      <SubmitButton>{de.team.invite}</SubmitButton>
    </form>
  );
}
