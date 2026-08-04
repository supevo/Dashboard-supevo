'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setAccountManagerAction } from '@/features/account-manager/actions';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';

export interface StaffOption {
  userId: string;
  name: string;
}

/** Admin control to assign the responsible account manager to a client. */
export function AccountManagerForm({
  clientCompanyId,
  currentManagerId,
  staff,
}: {
  clientCompanyId: string;
  currentManagerId: string | null;
  staff: StaffOption[];
}) {
  const [state, formAction] = useActionState(setAccountManagerAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <div className="min-w-[16rem] flex-1 space-y-1">
        <label htmlFor="managerId" className="text-sm font-medium">
          Verantwortlicher Ansprechpartner
        </label>
        <Select id="managerId" name="managerId" defaultValue={currentManagerId ?? ''}>
          <option value="">– keiner –</option>
          {staff.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <SubmitButton size="sm">Speichern</SubmitButton>
      {state.status === 'error' && (
        <Alert variant="destructive" className="w-full">
          {state.message}
        </Alert>
      )}
      {state.status === 'success' && (
        <Alert className="w-full">{state.message}</Alert>
      )}
    </form>
  );
}
