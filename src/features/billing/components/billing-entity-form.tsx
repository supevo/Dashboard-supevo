'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  upsertBillingEntityAction,
  deleteBillingEntityAction,
  setBillingEntityLogoAction,
} from '@/features/billing/actions';
import { Button } from '@/components/ui/button';
import { idleResult } from '@/lib/action-result';
import { centsToInput } from '@/lib/money';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/ui/submit-button';
import type { BillingEntity } from '@/features/billing/queries';

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

const LOGO_MAX_BYTES = 512 * 1024; // 512 KB Rohbild

/**
 * Logo-Uploader für EINEN Rechnungssteller. Rechnungen dieses Rechnungsstellers
 * tragen dann dieses Logo statt des org-weiten Standard-Logos. Für die PDF muss
 * es ein PNG/JPG sein (SVG kann pdf-lib nicht einbetten). Steht bewusst
 * AUSSERHALB des <form>, damit der versteckte Datei-Upload nicht das Formular
 * absendet.
 */
function EntityLogoUpload({
  entityId,
  orgId,
  current,
}: {
  entityId: string;
  orgId: string;
  current: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(dataUri: string) {
    setError(null);
    start(async () => {
      const res = await setBillingEntityLogoAction({ entityId, orgId, dataUri });
      if (res.status === 'error') setError('message' in res ? res.message ?? '' : '');
      else router.refresh();
    });
  }

  function onFile(file: File) {
    setError(null);
    if (file.size > LOGO_MAX_BYTES) {
      setError('Bild ist zu groß (max. 512 KB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => save(String(reader.result));
    reader.onerror = () => setError('Datei konnte nicht gelesen werden.');
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <SectionTitle>Logo dieses Rechnungsstellers</SectionTitle>
      <p className="text-xs text-muted-foreground">
        Erscheint auf allen Rechnungen dieses Rechnungsstellers. Ohne eigenes Logo
        wird das Standard-Logo der Organisation genutzt. Für die PDF bitte PNG/JPG
        (kein SVG), max. 512 KB.
      </p>
      <div className="flex h-24 w-fit items-center justify-center rounded-lg border bg-white p-3">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="Logo-Vorschau" className="max-h-16 w-auto" />
        ) : (
          <span className="px-6 text-neutral-400">Standard-Logo</span>
        )}
      </div>
      {error && (
        <Alert variant="destructive" className="text-xs">
          {error}
        </Alert>
      )}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Lädt …' : current ? 'Ersetzen' : 'Hochladen'}
        </Button>
        {current && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => save('')}
          >
            Entfernen
          </Button>
        )}
      </div>
    </div>
  );
}

/** Create/edit form for one billing entity (Rechnungssteller). */
export function BillingEntityForm({
  orgId,
  entity,
  onDone,
}: {
  orgId: string;
  entity: BillingEntity | null;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(
    upsertBillingEntityAction,
    idleResult,
  );
  const [delState, delAction] = useActionState(
    deleteBillingEntityAction,
    idleResult,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
      onDone?.();
    }
  }, [state, router, onDone]);

  useEffect(() => {
    if (delState.status === 'success') router.refresh();
  }, [delState, router]);

  return (
    <div className="space-y-4">
      {entity && (
        <EntityLogoUpload
          entityId={entity.id}
          orgId={orgId}
          current={entity.logo_dark ?? null}
        />
      )}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="orgId" value={orgId} />
        {entity && <input type="hidden" name="id" value={entity.id} />}

      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && <Alert>{state.message}</Alert>}
      {delState.status === 'error' && (
        <Alert variant="destructive">{delState.message}</Alert>
      )}

      <div className="space-y-1">
        <Label htmlFor="name">Interne Bezeichnung</Label>
        <Input
          id="name"
          name="name"
          defaultValue={entity?.name ?? ''}
          placeholder="z. B. supevo GmbH"
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_default"
          defaultChecked={entity?.is_default ?? false}
        />
        Standard-Rechnungssteller (für neue Kunden vorausgewählt)
      </label>

      <SectionTitle>Absender / Firma</SectionTitle>
      <Field name="company_name" label="Firmenname" defaultValue={entity?.company_name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="address_line1" label="Straße & Nr." defaultValue={entity?.address_line1} />
        <Field name="address_line2" label="Adresszusatz" defaultValue={entity?.address_line2} />
        <Field name="postal_code" label="PLZ" defaultValue={entity?.postal_code} />
        <Field name="city" label="Ort" defaultValue={entity?.city} />
        <Field name="country" label="Land" defaultValue={entity?.country ?? 'Deutschland'} />
        <Field name="contact_email" label="E-Mail" type="email" defaultValue={entity?.contact_email} />
        <Field name="phone" label="Telefon" defaultValue={entity?.phone} />
        <Field name="website" label="Website" defaultValue={entity?.website} />
      </div>

      <SectionTitle>Steuer</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="vat_id" label="USt-IdNr." defaultValue={entity?.vat_id} placeholder="DE123456789" />
        <Field name="tax_number" label="Steuernummer" defaultValue={entity?.tax_number} />
        <Field
          name="default_tax_rate"
          label="Steuersatz (%)"
          type="number"
          defaultValue={String(entity?.default_tax_rate ?? 19)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="small_business"
          defaultChecked={entity?.small_business ?? false}
        />
        Kleinunternehmer nach §19 UStG (keine USt ausweisen)
      </label>

      <SectionTitle>Bank &amp; SEPA</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="iban" label="IBAN" defaultValue={entity?.iban} />
        <Field name="bic" label="BIC" defaultValue={entity?.bic} />
        <Field name="bank_name" label="Bank" defaultValue={entity?.bank_name} />
        <Field
          name="creditor_id"
          label="Gläubiger-ID (SEPA)"
          defaultValue={entity?.creditor_id}
          placeholder="DE98ZZZ09999999999"
        />
      </div>

      <SectionTitle>Rechnungsnummern</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="invoice_prefix" label="Präfix (optional)" defaultValue={entity?.invoice_prefix} placeholder="z. B. RE-" />
        <Field
          name="invoice_next_number"
          label="Nächste Nummer"
          type="number"
          defaultValue={String(entity?.invoice_next_number ?? 1)}
        />
        <Field
          name="invoice_number_padding"
          label="Stellen (führende Nullen)"
          type="number"
          defaultValue={String(entity?.invoice_number_padding ?? 4)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="invoice_reset_yearly"
          defaultChecked={entity?.invoice_reset_yearly ?? true}
        />
        Nummernkreis jährlich zurücksetzen
      </label>
      <div className="space-y-1">
        <Label htmlFor="payment_terms_text">Zahlungshinweis</Label>
        <Input
          id="payment_terms_text"
          name="payment_terms_text"
          defaultValue={entity ? entity.payment_terms_text ?? '' : 'Zahlbar sofort ohne Abzug.'}
          placeholder="z. B. Zahlbar sofort ohne Abzug. – leer lassen = keine Zeile"
        />
        <p className="text-xs text-muted-foreground">
          Optionaler Zahlungshinweis auf der Rechnung. Leer lassen, wenn keine
          Zeile erscheinen soll.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoice_footer">Fußzeile (optional)</Label>
        <Textarea
          id="invoice_footer"
          name="invoice_footer"
          defaultValue={entity?.invoice_footer ?? ''}
          placeholder="z. B. Geschäftsführer, Registergericht, HRB …"
        />
      </div>

      <SectionTitle>Pakete (Stage-Preise, netto/Monat)</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="stage1_name" label="Stage 1 – Name" defaultValue={entity?.stage1_name ?? 'supevo Mitgliedschaft Stage 1'} />
        <Field
          name="stage1_price"
          label="Stage 1 – Preis (€ netto)"
          defaultValue={centsToInput(entity?.stage1_net_cents)}
          placeholder="4750"
        />
        <Field name="stage2_name" label="Stage 2 – Name" defaultValue={entity?.stage2_name ?? 'supevo Mitgliedschaft Stage 2'} />
        <Field
          name="stage2_price"
          label="Stage 2 – Preis (€ netto)"
          defaultValue={centsToInput(entity?.stage2_net_cents)}
          placeholder="7750"
        />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton>Speichern</SubmitButton>
        {entity && !entity.is_default && (
          <button
            type="submit"
            formAction={delAction}
            className="text-sm text-destructive hover:underline"
            onClick={(e) => {
              if (!confirm('Diesen Rechnungssteller wirklich löschen?')) {
                e.preventDefault();
              }
            }}
          >
            Löschen
          </button>
        )}
      </div>
      </form>
    </div>
  );
}

/** Collapsible wrapper: header row that expands to the edit form. */
export function BillingEntityCard({
  orgId,
  entity,
  defaultOpen = false,
}: {
  orgId: string;
  entity: BillingEntity;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted"
      >
        <span className="flex items-center gap-2">
          <span className="font-medium">{entity.name}</span>
          {entity.is_default && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              Standard
            </span>
          )}
          {entity.company_name && entity.company_name !== entity.name && (
            <span className="text-sm text-muted-foreground">
              {entity.company_name}
            </span>
          )}
        </span>
        <span className="text-sm text-muted-foreground">
          {open ? 'Schließen' : 'Bearbeiten'}
        </span>
      </button>
      {open && (
        <div className="border-t px-4 py-4">
          <BillingEntityForm orgId={orgId} entity={entity} />
        </div>
      )}
    </div>
  );
}

/** "Add new entity" section that reveals a blank form. */
export function AddBillingEntity({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-primary hover:underline"
      >
        + Rechnungssteller hinzufügen
      </button>
    );
  }
  return (
    <div className="rounded-md border border-dashed p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">Neuer Rechnungssteller</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted-foreground hover:underline"
        >
          Abbrechen
        </button>
      </div>
      <BillingEntityForm orgId={orgId} entity={null} onDone={() => setOpen(false)} />
    </div>
  );
}
