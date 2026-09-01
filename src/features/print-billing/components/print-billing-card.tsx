'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DropZone } from '@/components/ui/drop-zone';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  dismissPrintBillingAction,
  confirmPrintOrderedAction,
  markPrintSelfPaidAction,
} from '@/features/print-billing/actions';

export type PrintBillingCardStatus =
  | 'required'
  | 'ordered'
  | 'settled'
  | 'self_paid';

/**
 * „Abrechnung"-Hinweis auf der Aufgabe für Druckprodukte. Ablauf:
 *   required   → Frage „Druckprodukt bestellt?" (Ja / Kunde zahlt selbst / Nein)
 *   ordered    → Eingangsrechnung der Druckerei hochladen (→ Ausgaben)
 *   settled    → erledigt (Rechnung liegt in „Ausgaben")
 *   self_paid  → Kunde begleicht selbst; Beleg-Upload optional
 * Der Mitarbeiter handelt mit seinen Rechten (RLS).
 */
export function PrintBillingCard({
  taskId,
  status,
}: {
  taskId: string;
  status: PrintBillingCardStatus;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, startAction] = useTransition();

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

  // --- erledigt -------------------------------------------------------------
  if (status === 'settled') {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/[0.06] p-3 text-sm">
        <span className="font-medium text-emerald-700 dark:text-emerald-300">
          💶 Abrechnung erledigt
        </span>
        <p className="mt-1 text-xs text-muted-foreground">
          Die Dienstleister-Rechnung wurde hochgeladen und liegt im Bereich
          &bdquo;Ausgaben&ldquo;.
        </p>
      </div>
    );
  }

  // Wiederverwendbarer Upload-Block (Eingangsrechnung der Druckerei).
  const uploadBlock = (
    <>
      <DropZone overlayLabel="Rechnung hier ablegen">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
      </DropZone>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Betrag € (brutto, optional)"
        />
        <Input
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Druckerei / Dienstleister (optional)"
        />
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button size="sm" type="button" onClick={upload} disabled={pending}>
        {pending ? 'Wird hochgeladen …' : 'Rechnung hochladen'}
      </Button>
    </>
  );

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
            Rechnung der Druckerei bei Bedarf trotzdem als Beleg hochladen.
          </p>
        </div>
        {uploadBlock}
      </div>
    );
  }

  // --- bestellt: Eingangsrechnung fehlt ------------------------------------
  if (status === 'ordered') {
    return (
      <div className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/[0.06] p-3">
        <div>
          <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            💶 Eingangsrechnung der Druckerei fehlt
          </div>
          <p className="text-xs text-muted-foreground">
            Druckprodukt wurde bestellt. Bitte die Rechnung der Druckerei
            hochladen – sie geht in den internen Bereich &bdquo;Ausgaben&ldquo;
            und fließt in die monatliche Kundenrechnung ein.
          </p>
        </div>
        {uploadBlock}
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
          Diese Aufgabe wurde als Druckprodukt erkannt. Bitte angeben, wie damit
          verfahren wird.
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
          ✅ Ja, bestellt
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
