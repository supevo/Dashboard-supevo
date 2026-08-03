'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateHrProfileAction } from '@/features/hr-profile/actions';
import type { HrProfile } from '@/features/hr-profile/queries';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';

const TAX_CLASSES = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const;

/** A labelled text input bound to an HR field, prefilled from `initial`. */
function TF({
  name,
  label,
  value,
  placeholder,
  type = 'text',
  className,
}: {
  name: keyof HrProfile;
  label: string;
  value: string | number | null;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={value ?? ''}
        placeholder={placeholder}
      />
    </div>
  );
}

/**
 * Self-service form for an employee's HR/payroll master data. All fields are
 * optional so the profile can be filled in progressively; the data is stored in
 * a strictly access-controlled table (owner + org admin only).
 */
export function HrProfileForm({ initial }: { initial: HrProfile | null }) {
  const [state, formAction] = useActionState(updateHrProfileAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-6">
      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && <Alert>{state.message}</Alert>}

      <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        Diese Angaben braucht die Agentur bzw. der Steuerberater für die
        Lohnabrechnung. Sie sind vertraulich: nur du und die Agenturleitung
        können sie sehen.
      </p>

      {/* Person */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Person</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TF name="date_of_birth" label="Geburtsdatum" type="date" value={initial?.date_of_birth ?? null} />
          <TF name="place_of_birth" label="Geburtsort" value={initial?.place_of_birth ?? null} />
          <TF name="nationality" label="Staatsangehörigkeit" value={initial?.nationality ?? null} placeholder="z. B. deutsch" />
          <TF name="marital_status" label="Familienstand" value={initial?.marital_status ?? null} placeholder="z. B. ledig / verheiratet" />
          <TF name="private_phone" label="Telefon (privat)" type="tel" value={initial?.private_phone ?? null} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="show_birthday"
            defaultChecked={initial?.show_birthday ?? true}
            className="h-4 w-4"
          />
          Geburtstag (Tag &amp; Monat) im Team-Kalender anzeigen
        </label>
      </section>

      {/* Address */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Adresse</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <TF name="address_street" label="Straße" value={initial?.address_street ?? null} className="sm:col-span-3" />
          <TF name="address_house_no" label="Nr." value={initial?.address_house_no ?? null} />
          <TF name="address_zip" label="PLZ" value={initial?.address_zip ?? null} />
          <TF name="address_city" label="Ort" value={initial?.address_city ?? null} className="sm:col-span-2" />
          <TF name="address_country" label="Land" value={initial?.address_country ?? 'Deutschland'} />
        </div>
      </section>

      {/* Tax */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Steuer</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TF name="tax_id" label="Steuer-ID (11-stellig)" value={initial?.tax_id ?? null} placeholder="z. B. 12345678901" />
          <div className="space-y-1">
            <Label htmlFor="tax_class">Steuerklasse</Label>
            <Select id="tax_class" name="tax_class" defaultValue={initial?.tax_class ?? ''}>
              <option value="">– bitte wählen –</option>
              {TAX_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <TF name="child_allowances" label="Kinderfreibeträge" value={initial?.child_allowances ?? null} placeholder="z. B. 1 oder 0,5" />
          <TF name="religious_affiliation" label="Konfession (Kirchensteuer)" value={initial?.religious_affiliation ?? null} placeholder="z. B. rk / ev / keine" />
        </div>
      </section>

      {/* Social security */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Sozialversicherung</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TF name="social_security_number" label="Sozialversicherungsnummer" value={initial?.social_security_number ?? null} />
          <TF name="health_insurance" label="Krankenkasse" value={initial?.health_insurance ?? null} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="severely_disabled"
            defaultChecked={initial?.severely_disabled ?? false}
            className="h-4 w-4"
          />
          Schwerbehinderung vorhanden
        </label>
      </section>

      {/* Bank */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Bankverbindung (Gehalt)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TF name="iban" label="IBAN" value={initial?.iban ?? null} placeholder="DE.." className="sm:col-span-2" />
          <TF name="bic" label="BIC" value={initial?.bic ?? null} />
          <TF name="account_holder" label="Kontoinhaber (falls abweichend)" value={initial?.account_holder ?? null} />
        </div>
      </section>

      {/* Notes */}
      <div className="space-y-1">
        <Label htmlFor="notes">Sonstiges für die Lohnabrechnung</Label>
        <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ''} rows={3} />
      </div>

      <SubmitButton size="sm">Personaldaten speichern</SubmitButton>
    </form>
  );
}
