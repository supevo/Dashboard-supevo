'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { upsertAccountingProfileAction } from '@/features/accounting/actions';
import { RECHTSFORMEN, UST_PERIODEN } from '@/features/accounting/constants';
import { idleResult } from '@/lib/action-result';
import { centsToInput } from '@/lib/money';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';
import type { AccountingProfile } from '@/features/accounting/queries';

/** Tax master-data form for one accounting company (billing entity). */
export function CompanyProfileForm({
  billingEntityId,
  profile,
}: {
  billingEntityId: string;
  profile: AccountingProfile | null;
}) {
  const [state, formAction] = useActionState(
    upsertAccountingProfileAction,
    idleResult,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="billingEntityId" value={billingEntityId} />

      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && <Alert>{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="rechtsform">Rechtsform</Label>
          <Select
            id="rechtsform"
            name="rechtsform"
            defaultValue={profile?.rechtsform ?? 'einzelunternehmen'}
          >
            {RECHTSFORMEN.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="inhaber">Inhaber / Geschäftsführer</Label>
          <Input
            id="inhaber"
            name="inhaber"
            defaultValue={profile?.inhaber ?? ''}
            placeholder="Vor- und Nachname"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ust_periode">USt-Voranmeldung</Label>
          <Select
            id="ust_periode"
            name="ust_periode"
            defaultValue={profile?.ust_periode ?? 'quartal'}
          >
            {UST_PERIODEN.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="hebesatz">Gewerbesteuer-Hebesatz (%)</Label>
          <Input
            id="hebesatz"
            name="hebesatz"
            defaultValue={profile?.hebesatz != null ? String(profile.hebesatz) : ''}
            placeholder="z. B. 400"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="weitere_einkuenfte">
            Weitere Einkünfte p. a. (€, optional)
          </Label>
          <Input
            id="weitere_einkuenfte"
            name="weitere_einkuenfte"
            defaultValue={centsToInput(profile?.weitere_einkuenfte_cents)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="kleinunternehmer"
            defaultChecked={profile?.kleinunternehmer ?? false}
          />
          Kleinunternehmer nach §19 UStG (keine USt)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="kirchensteuer"
            defaultChecked={profile?.kirchensteuer ?? false}
          />
          Kirchensteuerpflichtig (9 %)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="splitting"
            defaultChecked={profile?.splitting ?? false}
          />
          Ehegatten-Splitting (Einkommensteuer)
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        Name, Adresse, USt-IdNr., Steuernummer und Bankdaten kommen aus dem
        Rechnungssteller (Tab „Rechnungen“). Hier nur die steuerlichen
        Zusatzangaben für EÜR, USt-Voranmeldung und Steuerschätzung.
      </p>

      <SubmitButton>Firmenprofil speichern</SubmitButton>
    </form>
  );
}
