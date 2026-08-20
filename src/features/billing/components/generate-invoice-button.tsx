'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createDraftInvoiceAction } from '@/features/billing/invoice-actions';
import { idleResult } from '@/lib/action-result';
import { SubmitButton } from '@/components/ui/submit-button';

/** Erstellt für einen Kunden einen Rechnungsentwurf (nur Entwurf). */
export function GenerateInvoiceButton({
  clientCompanyId,
}: {
  clientCompanyId: string;
}) {
  const [state, formAction] = useActionState(createDraftInvoiceAction, idleResult);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <SubmitButton size="sm" variant="outline">
        Generieren
      </SubmitButton>
      {state.status === 'error' && (
        <span className="ml-2 text-xs text-destructive">{state.message}</span>
      )}
    </form>
  );
}
