'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { assignClientBillingEntityAction } from '@/features/client-companies/actions';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/ui/submit-button';
import type { BillingEntity } from '@/features/billing/queries';

/** Dropdown to assign a client to a billing entity (Rechnungssteller). */
export function ClientBillingEntityForm({
  orgId,
  clientCompanyId,
  entities,
  currentEntityId,
}: {
  orgId: string;
  clientCompanyId: string;
  entities: BillingEntity[];
  currentEntityId: string | null;
}) {
  const [state, formAction] = useActionState(
    assignClientBillingEntityAction,
    idleResult,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const defaultEntity = entities.find((e) => e.is_default);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />

      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && <Alert>{state.message}</Alert>}

      <div className="space-y-1">
        <Label htmlFor="billingEntityId">Rechnungssteller</Label>
        <select
          id="billingEntityId"
          name="billingEntityId"
          defaultValue={currentEntityId ?? ''}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="">
            Standard{defaultEntity ? ` (${defaultEntity.name})` : ''}
          </option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.is_default ? ' – Standard' : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Bestimmt Absender und Rechnungsnummernkreis für die Rechnungen dieses
          Kunden. „Standard“ verwendet den als Standard markierten
          Rechnungssteller.
        </p>
      </div>

      <SubmitButton>Speichern</SubmitButton>
    </form>
  );
}
