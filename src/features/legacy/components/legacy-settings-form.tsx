'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateLegacySettingsAction } from '@/features/legacy/actions';
import {
  LEGACY_PACKAGES,
  LEGACY_PACKAGE_INFO,
  formatEuroCents,
  type LegacyPackage,
} from '@/features/legacy/packages';
import type { LegacySettings } from '@/features/legacy/queries';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/components/ui/submit-button';

/** Formats cents as a plain German decimal input value, e.g. 18000 → "180,00". */
function centsToInput(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Admin control to mark a client as a legacy customer and configure its package,
 * an optional free-entry net price (for negotiated discounts) and – for the
 * Performance package – the separately carried ad budgets (Google Ads / Meta).
 */
export function LegacySettingsForm({
  orgId,
  clientCompanyId,
  isLegacy,
  settings,
}: {
  orgId: string;
  clientCompanyId: string;
  isLegacy: boolean;
  settings: LegacySettings | null;
}) {
  const [state, formAction] = useActionState(
    updateLegacySettingsAction,
    idleResult,
  );
  const router = useRouter();
  const [legacy, setLegacy] = useState(isLegacy);
  const [pkg, setPkg] = useState<LegacyPackage>(settings?.package ?? 'care');

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  const info = LEGACY_PACKAGE_INFO[pkg];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="clientCompanyId" value={clientCompanyId} />

      <label className="flex items-start gap-2.5 rounded-md border p-3">
        <input
          type="checkbox"
          name="isLegacy"
          value="true"
          checked={legacy}
          onChange={(e) => setLegacy(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="block text-sm font-medium">
            Legacy-Kunde (Bestandskunde)
          </span>
          <span className="block text-xs text-muted-foreground">
            Wird in der Projektübersicht separat und kompakter unter den
            normalen Kunden angezeigt.
          </span>
        </span>
      </label>
      {/* Ensure a value is submitted even when the checkbox is unchecked. */}
      {!legacy && <input type="hidden" name="isLegacy" value="false" />}

      <div className="space-y-1">
        <label htmlFor="package" className="text-sm font-medium">
          Paket
        </label>
        <Select
          id="package"
          name="package"
          value={pkg}
          onChange={(e) => setPkg(e.target.value as LegacyPackage)}
        >
          {LEGACY_PACKAGES.map((key) => {
            const p = LEGACY_PACKAGE_INFO[key];
            return (
              <option key={key} value={key}>
                {p.label} · {formatEuroCents(p.priceCents)} netto/Monat
              </option>
            );
          })}
        </Select>
        <p className="text-xs text-muted-foreground">{info.tagline}</p>
      </div>

      <div className="rounded-md bg-muted/30 p-3 text-xs">
        <p className="mb-1 font-medium text-foreground">
          {info.label} · {formatEuroCents(info.priceCents)} netto/Monat
        </p>
        <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
          {info.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-1">
        <label htmlFor="customPrice" className="text-sm font-medium">
          Individueller Preis (netto/Monat, optional)
        </label>
        <Input
          id="customPrice"
          name="customPrice"
          inputMode="decimal"
          placeholder={centsToInput(info.priceCents)}
          defaultValue={centsToInput(settings?.customPriceCents ?? null)}
        />
        <p className="text-xs text-muted-foreground">
          Nur ausfüllen, wenn ein Rabatt vereinbart wurde. Leer = Paketpreis (
          {formatEuroCents(info.priceCents)}).
        </p>
      </div>

      {info.hasAdBudget && (
        <div className="space-y-3 rounded-md border border-dashed p-3">
          <p className="text-sm font-medium">
            Werbebudget (separat vom Kunden getragen)
          </p>
          <p className="text-xs text-muted-foreground">
            Nicht im Paketpreis enthalten. Nur eintragen, wenn ein Budget
            vereinbart wurde.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="googleAdsBudget" className="text-sm font-medium">
                Google Ads (€/Monat)
              </label>
              <Input
                id="googleAdsBudget"
                name="googleAdsBudget"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={centsToInput(settings?.googleAdsBudgetCents ?? null)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="metaBudget" className="text-sm font-medium">
                Meta (€/Monat)
              </label>
              <Input
                id="metaBudget"
                name="metaBudget"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={centsToInput(settings?.metaBudgetCents ?? null)}
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="notes" className="text-sm font-medium">
          Notiz (optional)
        </label>
        <Input
          id="notes"
          name="notes"
          defaultValue={settings?.notes ?? ''}
          placeholder="z. B. Sonderkonditionen, Ansprechpartner …"
        />
      </div>

      <SubmitButton size="sm">Speichern</SubmitButton>

      {state.status === 'error' && (
        <Alert variant="destructive">{state.message}</Alert>
      )}
      {state.status === 'success' && <Alert>{state.message}</Alert>}
    </form>
  );
}
