'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DropZone } from '@/components/ui/drop-zone';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * „Abrechnung"-Hinweis auf der Aufgabe: erscheint, wenn der Kunde Drucksachen
 * abrechnet und diese (fertige) Aufgabe ein Druckprodukt ist. Der Mitarbeiter
 * lädt hier die Lieferanten-/Dienstleister-Rechnung hoch – sie landet im
 * internen Bereich „Ausgaben" und die Aufgabe gilt als abgerechnet.
 */
export function PrintBillingCard({
  taskId,
  status,
}: {
  taskId: string;
  status: 'required' | 'settled';
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/[0.06] p-3">
      <div>
        <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          💶 Abrechnung – Druckprodukt
        </div>
        <p className="text-xs text-muted-foreground">
          Diese Aufgabe enthält ein Druckprodukt und wird dem Kunden berechnet.
          Bitte die Rechnung des Dienstleisters (wo bestellt wurde) hochladen –
          sie geht in den internen Bereich &bdquo;Ausgaben&ldquo;.
        </p>
      </div>

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
          placeholder="Betrag € (optional)"
        />
        <Input
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Dienstleister (optional)"
        />
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <Button size="sm" type="button" onClick={upload} disabled={pending}>
        {pending ? 'Wird hochgeladen …' : 'Rechnung hochladen'}
      </Button>
    </div>
  );
}
