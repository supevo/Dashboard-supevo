'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DropZone } from '@/components/ui/drop-zone';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  dismissPrintBillingAction,
  confirmPrintOrderedAction,
  markPrintSelfPaidAction,
  markPrintWeBillAction,
} from '@/features/print-billing/actions';

export type PrintBillingCardStatus =
  | 'required'
  | 'ordered'
  | 'settled'
  | 'self_paid';

type Kind = 'proforma' | 'final';

/**
 * „Abrechnung"-Hinweis auf der Aufgabe für Druckprodukte. Es müssen ZWEI
 * Rechnungen hochgeladen werden: die Proforma (sofort) und die nachträgliche
 * Endrechnung (~10 Tage später). Der Mitarbeiter handelt mit seinen Rechten (RLS).
 */
const MIN_MARKUP = 20;

/** German euro string ("12,50", "1.234,00") → number, or null. */
function parseEuro(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const v = Number.parseFloat(n);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

function formatEuro(value: number): string {
  return value.toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
  });
}

export function PrintBillingCard({
  taskId,
  status,
  hasProforma = false,
  hasFinal = false,
  presetMarkupPercent = MIN_MARKUP,
}: {
  taskId: string;
  status: PrintBillingCardStatus;
  hasProforma?: boolean;
  hasFinal?: boolean;
  /** Voreingestellter Aufschlag des Kunden (bereits auf >= 20 % gedeckelt). */
  presetMarkupPercent?: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');
  // Custom-Faktor je Drucksache; Default = voreingestellter Faktor des Kunden.
  const [factor, setFactor] = useState<string>(String(presetMarkupPercent));
  // Vorauswahl: was noch fehlt (erst Proforma, dann Endrechnung).
  const [kind, setKind] = useState<Kind>(hasProforma ? 'final' : 'proforma');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, startAction] = useTransition();

  // Effektiver Faktor (>= 20 %) und daraus der Kundenpreis für die Live-Anzeige.
  const factorNum = Math.max(MIN_MARKUP, Math.round(Number(factor) || 0));
  const supplierEuro = parseEuro(amount);
  const clientPriceEuro =
    supplierEuro != null ? supplierEuro * (1 + factorNum / 100) : null;

  async function upload() {
    if (!file) {
      setError('Bitte die Rechnung als Datei auswählen.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('taskId', taskId);
      fd.set('amount', amount);
      fd.set('supplier', supplier);
      fd.set('kind', kind);
      fd.set('markupPercent', String(factorNum));
      const res = await fetch('/api/print-expenses', { method: 'POST', body: fd });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Upload fehlgeschlagen.');
        return;
      }
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch {
      setError('Upload fehlgeschlagen.');
    } finally {
      setPending(false);
    }
  }

  const StatusLine = () => (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span className={cn(hasProforma ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300')}>
        {hasProforma ? '✓' : '⏳'} Proforma
      </span>
      <span className={cn(hasFinal ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300')}>
        {hasFinal ? '✓' : '⏳'} Endrechnung
      </span>
    </div>
  );

  // Preisrechner: Druckerei-Preis + Faktor → Kundenpreis (für „wir berechnen").
  const priceCalculator = (
    <div className="space-y-2 rounded-md border border-border/70 bg-background/60 p-2.5">
      <div className="text-xs font-medium text-muted-foreground">
        💶 Preis für den Kunden berechnen
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Druckerei-Preis € (brutto)"
        />
        <div>
          <div className="flex items-center gap-1">
            <Input
              value={factor}
              onChange={(e) => setFactor(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => setFactor(String(factorNum))}
              inputMode="numeric"
              className="w-24"
              aria-label="Aufschlag in Prozent"
            />
            <span className="text-sm text-muted-foreground">% Aufschlag</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Standard {presetMarkupPercent}% · min. {MIN_MARKUP}%
          </p>
        </div>
      </div>
      {clientPriceEuro != null && (
        <div className="flex items-baseline justify-between rounded bg-primary/5 px-2.5 py-1.5">
          <span className="text-xs text-muted-foreground">
            Kundenpreis (brutto)
          </span>
          <span className="text-base font-semibold">
            {formatEuro(clientPriceEuro)}
          </span>
        </div>
      )}
    </div>
  );

  // Upload-Block mit Auswahl Proforma/Endrechnung. `withCalc` blendet den
  // Preisrechner ein (nur wenn WIR dem Kunden berechnen, nicht bei „zahlt selbst").
  const renderUpload = (withCalc: boolean) => (
    <>
      {withCalc ? (
        priceCalculator
      ) : (
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Betrag € (brutto, optional)"
        />
      )}
      <Select
        value={kind}
        onChange={(e) => setKind(e.target.value as Kind)}
        className="h-9 text-sm"
      >
        <option value="proforma">Proforma-Rechnung (sofort)</option>
        <option value="final">Endrechnung (nachträglich)</option>
      </Select>
      <DropZone overlayLabel="Rechnung hier ablegen">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
      </DropZone>
      <Input
        value={supplier}
        onChange={(e) => setSupplier(e.target.value)}
        placeholder="Druckerei / Dienstleister (optional)"
      />
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button size="sm" type="button" onClick={upload} disabled={pending}>
        {pending
          ? 'Wird hochgeladen …'
          : kind === 'proforma'
            ? 'Proforma hochladen'
            : 'Endrechnung hochladen'}
      </Button>
    </>
  );

  // --- beide Rechnungen da → erledigt --------------------------------------
  if (hasProforma && hasFinal) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/[0.06] p-3 text-sm">
        <span className="font-medium text-emerald-700 dark:text-emerald-300">
          💶 Abrechnung erledigt
        </span>
        <p className="mt-1 text-xs text-muted-foreground">
          Proforma und Endrechnung sind hochgeladen und liegen im Bereich
          &bdquo;Ausgaben&ldquo;.
        </p>
      </div>
    );
  }

  // --- Kunde zahlt selbst ---------------------------------------------------
  if (status === 'self_paid') {
    return (
      <div className="space-y-3 rounded-lg border border-sky-500/40 bg-sky-500/[0.06] p-3">
        <div>
          <div className="text-sm font-semibold text-sky-700 dark:text-sky-300">
            🧾 Kunde begleicht die Druckerei-Rechnung selbst
          </div>
          <p className="text-xs text-muted-foreground">
            Es wird keine Ausgangsrechnung an den Kunden erzeugt. Du kannst die
            Rechnung(en) der Druckerei bei Bedarf trotzdem als Beleg hochladen.
          </p>
        </div>
        {renderUpload(false)}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={working}
            onClick={() =>
              startAction(async () => {
                await markPrintWeBillAction(taskId);
                router.refresh();
              })
            }
            className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          >
            Doch: wir bestellen &amp; berechnen dem Kunden
          </button>
        </div>
      </div>
    );
  }

  // --- bestellt / teils hochgeladen: fehlende Rechnung(en) hochladen -------
  if (status === 'ordered' || status === 'settled') {
    return (
      <div className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/[0.06] p-3">
        <div>
          <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            💶 Druckerei-Rechnungen hochladen
          </div>
          <p className="text-xs text-muted-foreground">
            Bitte <strong>beide</strong> Rechnungen hochladen: die Proforma sofort
            und die Endrechnung, sobald sie kommt (~10 Tage später). Sie gehen in
            den internen Bereich &bdquo;Ausgaben&ldquo;; nur die Endrechnung fließt
            in die monatliche Kundenrechnung ein.
          </p>
        </div>
        <StatusLine />
        {renderUpload(true)}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={working}
            onClick={() =>
              startAction(async () => {
                await markPrintSelfPaidAction(taskId);
                router.refresh();
              })
            }
            className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          >
            Kunde zahlt selbst
          </button>
        </div>
      </div>
    );
  }

  // --- required: 3-Wege-Frage ----------------------------------------------
  return (
    <div className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/[0.06] p-3">
      <div>
        <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          🖨️ Druckprodukt bestellt?
        </div>
        <p className="text-xs text-muted-foreground">
          Diese Aufgabe wurde als Druckprodukt erkannt. Bitte angeben, wer die
          Druckerei bezahlt – danach beide Rechnungen (Proforma + Endrechnung)
          hochladen.
        </p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          type="button"
          disabled={working}
          onClick={() =>
            startAction(async () => {
              const res = await confirmPrintOrderedAction(taskId);
              if (!res.ok) setError('Konnte nicht gespeichert werden.');
              router.refresh();
            })
          }
        >
          ✅ Wir bestellen &amp; berechnen
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={working}
          onClick={() =>
            startAction(async () => {
              const res = await markPrintSelfPaidAction(taskId);
              if (!res.ok) setError('Konnte nicht gespeichert werden.');
              router.refresh();
            })
          }
        >
          🧾 Kunde zahlt selbst
        </Button>
        <button
          type="button"
          disabled={working}
          onClick={() =>
            startAction(async () => {
              await dismissPrintBillingAction(taskId);
              router.refresh();
            })
          }
          className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          title="Kein Druckprodukt – Hinweis entfernen"
        >
          Nein, kein Druckprodukt
        </button>
      </div>
    </div>
  );
}
