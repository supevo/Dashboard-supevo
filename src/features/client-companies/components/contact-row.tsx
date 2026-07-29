'use client';

import { useActionState } from 'react';
import { removeClientContactAction } from '@/features/client-companies/contact-actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { SubmitButton } from '@/components/ui/submit-button';
import type { ClientContactRow } from '@/features/client-companies/queries';

export function ContactRow({
  orgId,
  clientCompanyId,
  contact,
  canManage = true,
}: {
  orgId: string;
  clientCompanyId: string;
  contact: ClientContactRow;
  /** Removing a contact stays admin-only; hide the control otherwise. */
  canManage?: boolean;
}) {
  const [state, formAction] = useActionState(
    removeClientContactAction,
    idleResult,
  );

  return (
    <li className="flex items-center justify-between py-3">
      <div>
        <div className="font-medium">{contact.fullName ?? '—'}</div>
        <div className="text-xs text-muted-foreground">{contact.email}</div>
        {state.status === 'error' && (
          <div className="text-xs text-destructive">{state.message}</div>
        )}
      </div>
      {canManage && (
        <form action={formAction}>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
          <input type="hidden" name="contactId" value={contact.id} />
          <SubmitButton variant="outline" size="sm">
            {de.clients.remove}
          </SubmitButton>
        </form>
      )}
    </li>
  );
}
