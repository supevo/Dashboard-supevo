'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setBelegNichtNoetigAction } from '@/features/accounting/month-close-actions';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

/**
 * „kein Beleg nötig" mit Pflicht-Begründung. Beim Markieren öffnet sich ein
 * Notizfeld; der Grund landet im Steuerberater-Export. Bei bereits markierten
 * Buchungen wird der Grund angezeigt und kann bearbeitet oder zurückgenommen
 * werden.
 */
export function NoReceiptToggle({
  transactionId,
  value,
  reason = '',
}: {
  transactionId: string;
  value: boolean;
  reason?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(reason);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const grund = text.trim();
    if (grund.length < 2) {
      setError('Bitte einen Grund angeben.');
      return;
    }
    setError(null);
    setBusy(true);
    const res = await setBelegNichtNoetigAction({
      transactionId,
      value: true,
      reason: grund,
    });
    setBusy(false);
    if (res.status === 'success') {
      setEditing(false);
      router.refresh();
    } else {
      setError(res.status === 'error' ? res.message : 'Fehler.');
    }
  }

  async function clear() {
    setBusy(true);
    const res = await setBelegNichtNoetigAction({ transactionId, value: false });
    setBusy(false);
    if (res.status === 'success') router.refresh();
  }

  // Eingabemodus: Notizfeld zum Erfassen/Bearbeiten des Grundes.
  if (editing) {
    return (
      <div className="space-y-1">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={500}
          autoFocus
          placeholder="Grund, warum kein Beleg nötig ist (z. B. Bankgebühr, Privateinlage) – kommt in den Steuerberater-Export."
          className="text-sm"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" type="button" onClick={save} disabled={busy}>
            Speichern
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setText(reason);
              setError(null);
            }}
            className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  // Bereits markiert: Grund anzeigen + bearbeiten / zurücknehmen.
  if (value) {
    return (
      <div className="space-y-0.5 text-xs">
        {reason && (
          <div className="text-muted-foreground">
            Grund: <span className="italic">{reason}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setText(reason);
              setEditing(true);
            }}
            className="text-primary hover:underline disabled:opacity-50"
          >
            Grund bearbeiten
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={clear}
            className="text-muted-foreground hover:underline disabled:opacity-50"
          >
            Beleg doch nötig
          </button>
        </div>
      </div>
    );
  }

  // Noch nicht markiert: Klick öffnet das Notizfeld.
  return (
    <button
      type="button"
      onClick={() => {
        setText('');
        setEditing(true);
      }}
      disabled={busy}
      className="text-xs text-primary hover:underline disabled:opacity-50"
    >
      kein Beleg nötig
    </button>
  );
}
