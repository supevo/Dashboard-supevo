'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setClientAttentionFactorAction } from '@/features/client-companies/actions';
import { idleResult } from '@/lib/action-result';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

/**
 * Sets the client's fair-share weight for the health traffic light. 1 = normal
 * share; higher means this client should receive more of the team's attention
 * before the light turns orange (over-served), lower means less.
 */
export function AttentionFactorForm({
  orgId,
  clientCompanyId,
  value,
}: {
  orgId: string;
  clientCompanyId: string;
  value: number;
}) {
  const [state, action] = useActionState(
    setClientAttentionFactorAction,
    idleResult,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-3">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && (
        <Alert variant="success">{state.message}</Alert>
      )}
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <div className="flex items-center gap-3">
        <Input
          type="number"
          name="attentionFactor"
          defaultValue={value}
          step="0.1"
          min="0.1"
          max="10"
          className="h-9 w-24"
        />
        <SubmitButton size="sm">Speichern</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        1 = normaler Anteil. Höher = dieser Kunde soll mehr Betreuung bekommen
        (kippt erst später ins Orange), niedriger = weniger.
      </p>
    </form>
  );
}
