'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateBillingSettingsAction } from '@/features/billing/actions';
import { idleResult } from '@/lib/action-result';
import { centsToInput } from '@/lib/money';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import type { BillingSettings } from '@/features/billing/queries';

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  type = 'text',
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder}
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b pb-1 pt-2 text-sm font-semibold text-muted-foreground">
      {children}
    </h3>
  );
}

export function BillingSettingsForm({
  orgId,
  settings,
}: {
  orgId: string;
  settings: BillingSettings | null;
}) {
  const [state, formAction] = useActionState(
    updateBillingSettingsAction,
    idleResult,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />

      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && <Alert>{state.message}</Alert>}

      <SectionTitle>Absender / Firma</SectionTitle>
      <Field name="company_name" label="Firmenname" defaultValue={settings?.company_name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="address_line1" label="Straße & Nr." defaultValue={settings?.address_line1} />
        <Field name="address_line2" label="Adresszusatz" defaultValue={settings?.address_line2} />
        <Field name="postal_code" label="PLZ" defaultValue={settings?.postal_code} />
        <Field name="city" label="Ort" defaultValue={settings?.city} />
        <Field name="country" label="Land" defaultValue={settings?.country ?? 'Deutschland'} />
        <Field name="contact_email" label="E-Mail" type="email" defaultValue={settings?.contact_email} />
        <Field name="phone" label="Telefon" defaultValue={settings?.phone} />
        <Field name="website" label="Website" defaultValue={settings?.website} />
      </div>

      <SectionTitle>Steuer</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="vat_id" label="USt-IdNr." defaultValue={settings?.vat_id} placeholder="DE123456789" />
        <Field name="tax_number" label="Steuernummer" defaultValue={settings?.tax_number} />
        <Field
          name="default_tax_rate"
          label="Steuersatz (%)"
          type="number"
          defaultValue={String(settings?.default_tax_rate ?? 19)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="small_business"
          defaultChecked={settings?.small_business ?? false}
        />
        Kleinunternehmer nach §19 UStG (keine USt ausweisen)
      </label>

      <SectionTitle>Bank &amp; SEPA</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="iban" label="IBAN" defaultValue={settings?.iban} />
        <Field name="bic" label="BIC" defaultValue={settings?.bic} />
        <Field name="bank_name" label="Bank" defaultValue={settings?.bank_name} />
        <Field
          name="creditor_id"
          label="Gläubiger-ID (SEPA)"
          defaultValue={settings?.creditor_id}
          placeholder="DE98ZZZ09999999999"
        />
      </div>

      <SectionTitle>Rechnungsnummern</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="invoice_prefix" label="Präfix (optional)" defaultValue={settings?.invoice_prefix} placeholder="z. B. RE-" />
        <Field
          name="invoice_next_number"
          label="Nächste Nummer"
          type="number"
          defaultValue={String(settings?.invoice_next_number ?? 1)}
        />
        <Field
          name="invoice_number_padding"
          label="Stellen (führende Nullen)"
          type="number"
          defaultValue={String(settings?.invoice_number_padding ?? 4)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="invoice_reset_yearly"
          defaultChecked={settings?.invoice_reset_yearly ?? true}
        />
        Nummernkreis jährlich zurücksetzen
      </label>
      <div className="space-y-1">
        <Label htmlFor="payment_terms_text">Zahlungshinweis</Label>
        <Input
          id="payment_terms_text"
          name="payment_terms_text"
          defaultValue={settings?.payment_terms_text ?? 'Zahlbar sofort ohne Abzug.'}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoice_footer">Fußzeile (optional)</Label>
        <Textarea
          id="invoice_footer"
          name="invoice_footer"
          defaultValue={settings?.invoice_footer ?? ''}
          placeholder="z. B. Geschäftsführer, Registergericht, HRB …"
        />
      </div>

      <SectionTitle>Pakete (Stage-Preise, netto/Monat)</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="stage1_name" label="Stage 1 – Name" defaultValue={settings?.stage1_name ?? 'supevo Mitgliedschaft Stage 1'} />
        <Field
          name="stage1_price"
          label="Stage 1 – Preis (€ netto)"
          defaultValue={centsToInput(settings?.stage1_net_cents)}
          placeholder="4750"
        />
        <Field name="stage2_name" label="Stage 2 – Name" defaultValue={settings?.stage2_name ?? 'supevo Mitgliedschaft Stage 2'} />
        <Field
          name="stage2_price"
          label="Stage 2 – Preis (€ netto)"
          defaultValue={centsToInput(settings?.stage2_net_cents)}
          placeholder="7750"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Leistungen je Paket – eine pro Zeile. Beim Herabstufen sieht der Kunde,
        welche Vorteile er verliert.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="stage1_benefits">Stage 1 – Leistungen</Label>
          <Textarea
            id="stage1_benefits"
            name="stage1_benefits"
            rows={5}
            defaultValue={settings?.stage1_benefits ?? ''}
            placeholder={'1 aktive Aufgabe\nE-Mail-Support\nMonatsreport'}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="stage2_benefits">Stage 2 – Leistungen</Label>
          <Textarea
            id="stage2_benefits"
            name="stage2_benefits"
            rows={5}
            defaultValue={settings?.stage2_benefits ?? ''}
            placeholder={'2 parallele Aufgaben\nPrioritäts-Support\nWöchentliche Reports\nExpress-Tickets'}
          />
        </div>
      </div>

      <SubmitButton>Speichern</SubmitButton>
    </form>
  );
}
