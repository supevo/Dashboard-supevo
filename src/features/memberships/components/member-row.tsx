'use client';

import Link from 'next/link';

import { useActionState } from 'react';
import {
  changeRoleAction,
  deactivateMemberAction,
  reactivateMemberAction,
  setJoinDateAction,
} from '@/features/memberships/actions';
import { INVITABLE_ROLES } from '@/features/invitations/schema';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/submit-button';
import { PurgeMemberButton } from '@/features/admin/components/purge-member-button';
import type { OrgMember } from '@/features/memberships/queries';

export function MemberRow({
  orgId,
  member,
  canPurge = false,
}: {
  orgId: string;
  member: OrgMember;
  /** Super-Admin: Mitarbeiter endgültig aus der Org entfernen (Master-Passwort). */
  canPurge?: boolean;
}) {
  const [roleState, roleAction] = useActionState(changeRoleAction, idleResult);
  const [statusState, statusAction] = useActionState(
    member.status === 'suspended'
      ? reactivateMemberAction
      : deactivateMemberAction,
    idleResult,
  );
  const [joinState, joinAction] = useActionState(setJoinDateAction, idleResult);

  const anyError =
    (roleState.status === 'error' && roleState.message) ||
    (statusState.status === 'error' && statusState.message) ||
    (joinState.status === 'error' && joinState.message) ||
    null;

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4">
        <div className="font-medium">
          <Link
            href={`/app/team/${member.userId}`}
            className="text-primary hover:underline"
          >
            {member.fullName ?? '—'}
          </Link>{' '}
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
      <td className="py-2 pr-4">
        <form action={joinAction} className="flex items-center gap-2">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="targetUserId" value={member.userId} />
          <Input
            type="date"
            name="joinedAt"
            defaultValue={member.joinedAt ?? ''}
            aria-label={de.team.joinDate}
            className="h-9 w-auto"
          />
          <SubmitButton variant="outline" size="sm">
            {de.team.saveJoinDate}
          </SubmitButton>
        </form>
      </td>
      <td className="py-2 text-right">
        {!member.isSelf && (
          <div className="flex items-center justify-end gap-2">
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
            {canPurge && (
              <PurgeMemberButton
                userId={member.userId}
                orgId={orgId}
                memberName={member.fullName ?? member.email ?? 'Mitarbeiter'}
              />
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
