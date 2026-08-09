'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { importBankStatementAction } from '@/features/accounting/transaction-actions';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

/** Upload + import a bank statement (CSV / CAMT.053 / MT940) for one company. */
export function BankUploadForm({ billingEntityId }: { billingEntityId: string }) {
  const [state, formAction] = useActionState(
    importBankStatementAction,
    idleResult,
  );
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      formRef.current?.reset();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="billingEntityId" value={billingEntityId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="file" className="text-sm font-medium">
            Kontoauszug-Datei
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,.xml,.sta,.txt,.940,.mt940,.pdf,text/csv,text/xml,application/xml,application/pdf"
            required
            className="block text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm hover:file:bg-muted"
          />
        </div>
        <SubmitButton>Importieren</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        CSV, CAMT.053 (XML), MT940 (.sta) oder PDF. Die KI liest jede Buchung
        aus – bereits importierte Überschneidungen werden übersprungen.
      </p>
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && <Alert>{state.message}</Alert>}
    </form>
  );
}
