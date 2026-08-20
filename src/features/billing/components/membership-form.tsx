'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { upsertMembershipAction } from '@/features/billing/membership-actions';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';
import type { ClientMembership } from '@/features/billing/membership';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b pb-1 pt-2 text-sm font-semibold text-muted-foreground">
      {children}
    </h3>
  );
}

export function MembershipForm({
  orgId,
  clientCompanyId,
  membership,
}: {
  orgId: string;
  clientCompanyId: string;
  membership: ClientMembership | null;
}) {
  const [state, formAction] = useActionState(upsertMembershipAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />

      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && <Alert>{state.message}</Alert>}

      <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Stufe &amp; Preis stellst du oben im Baukasten „supevo-Mitgliedschaft“
        ein. Hier geht es nur um Abrechnungsrhythmus, Zahlweg und Adresse.
      </p>

      <SectionTitle>Abrechnung</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="interval_months">Intervall</Label>
          <Select
            id="interval_months"
            name="interval_months"
            defaultValue={String(membership?.interval_months ?? 1)}
          >
            <option value="1">Monatlich</option>
            <option value="3">Quartalsweise</option>
            <option value="12">Jährlich</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="billing_day">Abrechnungstag</Label>
          <Input
            id="billing_day"
            name="billing_day"
            type="number"
            min={1}
            max={28}
            defaultValue={String(membership?.billing_day ?? 15)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="start_date">Startdatum</Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={
              membership?.start_date ?? new Date().toISOString().slice(0, 10)
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Status</Label>
          <Select
            id="status"
            name="status"
            defaultValue={membership?.status ?? 'active'}
          >
            <option value="active">Aktiv</option>
            <option value="paused">Pausiert</option>
            <option value="canceled">Gekündigt</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="payment_method">Zahlweg</Label>
          <Select
            id="payment_method"
            name="payment_method"
            defaultValue={membership?.payment_method ?? 'sepa'}
          >
            <option value="sepa">SEPA-Lastschrift</option>
            <option value="transfer">Überweisung</option>
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="auto_send"
          defaultChecked={membership?.auto_send ?? false}
        />
        Rechnung automatisch versenden (sonst nur Entwurf zur Freigabe)
      </label>

      <SectionTitle>Rechnungsadresse des Kunden</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="billing_name">Name / Firma</Label>
          <Input id="billing_name" name="billing_name" defaultValue={membership?.billing_name ?? ''} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="billing_vat_id">USt-IdNr. (optional)</Label>
          <Input id="billing_vat_id" name="billing_vat_id" defaultValue={membership?.billing_vat_id ?? ''} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="billing_address_line1">Straße & Nr.</Label>
          <Input id="billing_address_line1" name="billing_address_line1" defaultValue={membership?.billing_address_line1 ?? ''} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="billing_address_line2">Adresszusatz</Label>
          <Input id="billing_address_line2" name="billing_address_line2" defaultValue={membership?.billing_address_line2 ?? ''} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="billing_postal_code">PLZ</Label>
          <Input id="billing_postal_code" name="billing_postal_code" defaultValue={membership?.billing_postal_code ?? ''} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="billing_city">Ort</Label>
          <Input id="billing_city" name="billing_city" defaultValue={membership?.billing_city ?? ''} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="billing_country">Land</Label>
          <Input id="billing_country" name="billing_country" defaultValue={membership?.billing_country ?? 'Deutschland'} />
        </div>
      </div>

      <SectionTitle>SEPA-Mandat (bei Lastschrift)</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="mandate_reference">Mandatsreferenz</Label>
          <Input id="mandate_reference" name="mandate_reference" defaultValue={membership?.mandate_reference ?? ''} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mandate_date">Mandatsdatum</Label>
          <Input id="mandate_date" name="mandate_date" type="date" defaultValue={membership?.mandate_date ?? ''} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="debtor_iban">IBAN des Kunden</Label>
          <Input id="debtor_iban" name="debtor_iban" defaultValue={membership?.debtor_iban ?? ''} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="debtor_bic">BIC (optional)</Label>
          <Input id="debtor_bic" name="debtor_bic" defaultValue={membership?.debtor_bic ?? ''} />
        </div>
      </div>

      <SubmitButton>Mitgliedschaft speichern</SubmitButton>
    </form>
  );
}
