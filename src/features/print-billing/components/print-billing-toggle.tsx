'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setPrintBillingAction } from '@/features/print-billing/actions';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';

/** Admin toggle: whether print products are billed for this client. */
export function PrintBillingToggle({
  clientCompanyId,
  billPrint,
}: {
  clientCompanyId: string;
  billPrint: boolean;
}) {
  const [state, formAction] = useActionState(setPrintBillingAction, idleResult);
  const router = useRouter();
  const [checked, setChecked] = useState(billPrint);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />
      <input type="hidden" name="billPrint" value={checked ? 'true' : 'false'} />

      <label className="flex items-start gap-2.5 rounded-md border p-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="block text-sm font-medium">
            Drucksachen abrechnen
          </span>
          <span className="block text-xs text-muted-foreground">
            Wird eine als &bdquo;Fertig&ldquo; markierte Aufgabe als Druckprodukt erkannt,
            erscheint darauf ein Abrechnungs-Hinweis zum Hochladen der
            Dienstleister-Rechnung. Aus = Drucksachen werden nicht abgerechnet.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton size="sm">Speichern</SubmitButton>
        {state.status === 'error' && (
          <Alert variant="destructive" className="flex-1">
            {state.message}
          </Alert>
        )}
        {state.status === 'success' && (
          <Alert className="flex-1">{state.message}</Alert>
        )}
      </div>
    </form>
  );
}
