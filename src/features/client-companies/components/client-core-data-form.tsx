'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateClientCoreDataAction } from '@/features/client-companies/actions';
import { idleResult } from '@/lib/action-result';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field-error';
import { SubmitButton } from '@/components/ui/submit-button';

/**
 * Stammdaten eines bestehenden Kunden bearbeiten – dieselben Felder wie bei der
 * Anlage (Name, Notizen, Kundentyp supevo/legacy). Kontrollierte Felder, damit
 * die React-19-Form-Reset-Logik die Anzeige nach dem Speichern nicht zurücksetzt.
 */
export function ClientCoreDataForm({
  orgId,
  clientCompanyId,
  name,
  notes,
  isLegacy,
  canEditType = true,
}: {
  orgId: string;
  clientCompanyId: string;
  name: string;
  notes: string | null;
  isLegacy: boolean;
  /** Kundentyp (supevo/Legacy) ist abrechnungsrelevant – nur Admins dürfen ihn
   *  ändern. Für Mitarbeiter wird der Regler ausgeblendet. */
  canEditType?: boolean;
}) {
  const [state, formAction] = useActionState(updateClientCoreDataAction, idleResult);
  const router = useRouter();

  const [nameV, setNameV] = useState(name);
  const [notesV, setNotesV] = useState(notes ?? '');
  const [type, setType] = useState<'supevo' | 'legacy'>(isLegacy ? 'legacy' : 'supevo');

  useEffect(() => setNameV(name), [name]);
  useEffect(() => setNotesV(notes ?? ''), [notes]);
  useEffect(() => setType(isLegacy ? 'legacy' : 'supevo'), [isLegacy]);

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3">
      {state.status === 'success' && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === 'error' && <Alert variant="destructive">{state.message}</Alert>}
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />

      <div className="space-y-1">
        <Label htmlFor="core-name">Name</Label>
        <Input
          id="core-name"
          name="name"
          value={nameV}
          onChange={(e) => setNameV(e.target.value)}
          required
        />
        {state.status === 'error' && <FieldError errors={state.fieldErrors?.name} />}
      </div>

      <div className="space-y-1">
        <Label htmlFor="core-notes">Notizen</Label>
        <Textarea
          id="core-notes"
          name="notes"
          rows={2}
          value={notesV}
          onChange={(e) => setNotesV(e.target.value)}
        />
      </div>

      {!canEditType ? (
        // Kundentyp bleibt admin-only: aktuellen Wert unverändert mitsenden.
        <input type="hidden" name="customerType" value={type} />
      ) : (
      <fieldset className="space-y-2">
        <Label>Kundentyp</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-500/5">
            <input
              type="radio"
              name="customerType"
              value="supevo"
              checked={type === 'supevo'}
              onChange={() => setType('supevo')}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">supevo</span>
              <span className="block text-xs text-muted-foreground">
                Komplettbetreuung – Stage 1 oder Stage 2.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-500/5">
            <input
              type="radio"
              name="customerType"
              value="legacy"
              checked={type === 'legacy'}
              onChange={() => setType('legacy')}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Legacy / Bestandskunde</span>
              <span className="block text-xs text-muted-foreground">
                Einzelne Module aus dem Baukasten + Custompreis.
              </span>
            </span>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Steuert die Mitgliedschafts-Ansicht (Stufen vs. Module) im Baukasten und
          im Kundenportal.
        </p>
      </fieldset>
      )}

      <SubmitButton size="sm">Speichern</SubmitButton>
    </form>
  );
}
