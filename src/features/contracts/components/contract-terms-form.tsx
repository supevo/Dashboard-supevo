'use client';

import { useActionState } from 'react';
import { updateContractTermsAction } from '@/features/contracts/actions';
import { idleResult } from '@/lib/action-result';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';

export function ContractTermsForm({ orgId, terms }: { orgId: string; terms: string }) {
  const [state, action] = useActionState(updateContractTermsAction, idleResult);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orgId" value={orgId} />
      <textarea
        name="terms"
        defaultValue={terms}
        rows={22}
        className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <SubmitButton>Speichern</SubmitButton>
        {state.status === 'success' && (
          <Alert className="py-1 text-xs">{state.message}</Alert>
        )}
        {state.status === 'error' && (
          <Alert variant="destructive" className="py-1 text-xs">
            {state.message}
          </Alert>
        )}
      </div>
    </form>
  );
}
