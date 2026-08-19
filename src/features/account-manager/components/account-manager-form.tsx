'use client';

import { useActionState, useEffect, useState } from 'react';
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

/**
 * Admin control to assign the responsible main contact ("Hauptansprechpartner")
 * and an optional deputy ("Stellvertretung") to a client.
 */
export function AccountManagerForm({
  clientCompanyId,
  currentManagerId,
  currentSecondaryManagerId,
  staff,
}: {
  clientCompanyId: string;
  currentManagerId: string | null;
  currentSecondaryManagerId: string | null;
  staff: StaffOption[];
}) {
  const [state, formAction] = useActionState(setAccountManagerAction, idleResult);
  const router = useRouter();

  // Kontrollierte Auswahl: Ein <form action={...}> setzt in React 19 seine
  // unkontrollierten Felder nach dem Absenden automatisch auf den defaultValue
  // zurück – dadurch sprang die Anzeige trotz erfolgreichem Speichern zurück auf
  // „keiner". Mit State-gesteuerten Selects bleibt der gewählte Wert stehen; nach
  // dem router.refresh() synchronisieren wir mit den frischen Server-Props.
  const [managerId, setManagerId] = useState(currentManagerId ?? '');
  const [secondaryManagerId, setSecondaryManagerId] = useState(
    currentSecondaryManagerId ?? '',
  );

  useEffect(() => {
    setManagerId(currentManagerId ?? '');
  }, [currentManagerId]);
  useEffect(() => {
    setSecondaryManagerId(currentSecondaryManagerId ?? '');
  }, [currentSecondaryManagerId]);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="managerId" className="text-sm font-medium">
            Hauptansprechpartner
          </label>
          <Select
            id="managerId"
            name="managerId"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
          >
            <option value="">– keiner –</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor="secondaryManagerId" className="text-sm font-medium">
            Stellvertretung
          </label>
          <Select
            id="secondaryManagerId"
            name="secondaryManagerId"
            value={secondaryManagerId}
            onChange={(e) => setSecondaryManagerId(e.target.value)}
          >
            <option value="">– keine –</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

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
