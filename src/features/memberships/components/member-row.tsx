'use client';

import { useActionState } from 'react';
import {
  changeRoleAction,
  deactivateMemberAction,
  reactivateMemberAction,
} from '@/features/memberships/actions';
import { INVITABLE_ROLES } from '@/features/invitations/schema';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';
import type { OrgMember } from '@/features/memberships/queries';

export function MemberRow({
  orgId,
  member,
}: {
  orgId: string;
  member: OrgMember;
}) {
  const [roleState, roleAction] = useActionState(changeRoleAction, idleResult);
  const [statusState, statusAction] = useActionState(
    member.status === 'suspended'
      ? reactivateMemberAction
      : deactivateMemberAction,
    idleResult,
  );

  const anyError =
    (roleState.status === 'error' && roleState.message) ||
    (statusState.status === 'error' && statusState.message) ||
    null;

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4">
        <div className="font-medium">
          {member.fullName ?? '—'}{' '}
          {member.isSelf && (
            <span className="text-xs text-muted-foreground">
              ({de.team.self})
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{member.email}</div>
        {anyError && <div className="text-xs text-destructive">{anyError}</div>}
      </td>
      <td className="py-2 pr-4">
        <span className="text-xs text-muted-foreground">
          {de.status[member.status]}
        </span>
      </td>
      <td className="py-2 pr-4">
        {member.isSelf ? (
          <span className="text-sm">{de.roles[member.role]}</span>
        ) : (
          <form action={roleAction} className="flex items-center gap-2">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="targetUserId" value={member.userId} />
            <Select
              name="nextRole"
              defaultValue={member.role}
              className="h-9 w-auto"
            >
              {INVITABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {de.roles[role]}
                </option>
              ))}
            </Select>
            <SubmitButton variant="outline" size="sm">
              {de.team.changeRole}
            </SubmitButton>
          </form>
        )}
      </td>
      <td className="py-2 text-right">
        {!member.isSelf && (
          <form action={statusAction}>
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="targetUserId" value={member.userId} />
            <SubmitButton
              variant={member.status === 'suspended' ? 'outline' : 'destructive'}
              size="sm"
            >
              {member.status === 'suspended'
                ? de.team.reactivate
                : de.team.deactivate}
            </SubmitButton>
          </form>
        )}
      </td>
    </tr>
  );
}
