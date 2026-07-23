'use client';

import { useActionState } from 'react';
import {
  revokeInvitationAction,
  resendInvitationAction,
} from '@/features/invitations/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { SubmitButton } from '@/components/ui/submit-button';
import type { OpenInvitation } from '@/features/invitations/queries';

export function InvitationRow({
  orgId,
  invitation,
}: {
  orgId: string;
  invitation: OpenInvitation;
}) {
  const [revokeState, revokeAction] = useActionState(
    revokeInvitationAction,
    idleResult,
  );
  const [resendState, resendAction] = useActionState(
    resendInvitationAction,
    idleResult,
  );
  const newUrl =
    resendState.status === 'success' &&
    typeof resendState.data?.inviteUrl === 'string'
      ? resendState.data.inviteUrl
      : null;

  return (
    <tr className="border-b last:border-0 align-top">
      <td className="py-2 pr-4">
        <div className="font-medium">{invitation.email}</div>
        <div className="text-xs text-muted-foreground">
          {de.roles[invitation.role]} · gültig bis{' '}
          {new Date(invitation.expiresAt).toLocaleDateString('de-DE')}
        </div>
        {newUrl && (
          <code className="mt-1 block break-all text-xs text-green-700">
            {newUrl}
          </code>
        )}
        {revokeState.status === 'error' && (
          <div className="text-xs text-destructive">{revokeState.message}</div>
        )}
      </td>
      <td className="py-2 text-right">
        <div className="flex justify-end gap-2">
          <form action={resendAction}>
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="invitationId" value={invitation.id} />
            <SubmitButton variant="outline" size="sm">
              {de.team.resend}
            </SubmitButton>
          </form>
          <form action={revokeAction}>
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="invitationId" value={invitation.id} />
            <SubmitButton variant="destructive" size="sm">
              {de.team.revoke}
            </SubmitButton>
          </form>
        </div>
      </td>
    </tr>
  );
}
