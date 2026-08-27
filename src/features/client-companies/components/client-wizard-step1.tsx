'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientCompanyAction } from '@/features/client-companies/actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

export interface BillingEntityOption {
  id: string;
  name: string;
  isDefault: boolean;
}

/**
 * Step 1 of the guided new-client wizard: creates the client company and, on
 * success, advances to the membership step for the freshly created client.
 */
export function ClientWizardStep1({
  orgId,
  entities,
}: {
  orgId: string;
  entities: BillingEntityOption[];
}) {
  const [state, formAction] = useActionState(createClientCompanyAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      const id = (state.data as { id?: string } | undefined)?.id;
      if (id) router.push(`/app/clients/new?step=2&client=${id}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === 'error' && <Alert variant="destructive">{state.message}</Alert>}
      <input type="hidden" name="orgId" value={orgId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">{de.clients.name}</Label>
          <Input id="name" name="name" required autoFocus />
          {state.status === 'error' && <FieldError errors={state.fieldErrors?.name} />}
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactEmail">{de.clients.contactEmail}</Label>
          <Input id="contactEmail" name="contactEmail" type="email" />
          {state.status === 'error' && <FieldError errors={state.fieldErrors?.contactEmail} />}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">{de.clients.notes}</Label>
        <Textarea id="notes" name="notes" />
      </div>

      <fieldset className="space-y-2">
        <Label>Kundentyp</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-500/5">
            <input type="radio" name="customerType" value="supevo" defaultChecked className="mt-0.5" />
            <span>
              <span className="font-medium">supevo</span>
              <span className="block text-xs text-muted-foreground">
                Komplettbetreuung – Stage 1 oder Stage 2.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-500/5">
            <input type="radio" name="customerType" value="legacy" className="mt-0.5" />
            <span>
              <span className="font-medium">supevo Smart</span>
              <span className="block text-xs text-muted-foreground">
                Einzelne Module aus dem Baukasten + Custompreis.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {entities.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="billingEntityId">Rechnungssteller (Firma)</Label>
          <Select
            id="billingEntityId"
            name="billingEntityId"
            defaultValue={entities.find((e) => e.isDefault)?.id ?? entities[0]?.id ?? ''}
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.isDefault ? ' (Standard)' : ''}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Unter welcher hinterlegten Firma (z. B. supevo oder ONE STEP) der
            Kunde abgerechnet wird.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Die Rechnungsadresse des Kunden erfasst du im nächsten Schritt bei der
        Mitgliedschaft – daraus entsteht später der Vertrag.
      </p>
      <SubmitButton>Weiter zur Mitgliedschaft →</SubmitButton>
    </form>
  );
}
