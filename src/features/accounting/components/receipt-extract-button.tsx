'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  extractReceiptAction,
  extractOpenReceiptsAction,
} from '@/features/accounting/receipt-extract-actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/** KI-Vision extraction trigger: whole company ('all') or a single receipt. */
export function ReceiptExtractButton({
  mode,
  id,
}: {
  mode: 'all' | 'one';
  id: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function runOne() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await extractReceiptAction(id);
      const text = 'message' in res ? (res.message ?? '') : '';
      setMsg({ ok: res.status === 'success', text });
      if (res.status === 'success') router.refresh();
    } catch {
      setMsg({ ok: false, text: 'Auslesen fehlgeschlagen. Bitte erneut versuchen.' });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Reads all open receipts in small batches, looping until nothing is left or a
   * batch makes no progress. Shows a live count and never hangs on a timeout.
   */
  async function runAll() {
    setBusy(true);
    setMsg(null);
    let totalDone = 0;
    let totalFailed = 0;
    try {
      for (let i = 0; i < 50; i++) {
        const res = await extractOpenReceiptsAction(id);
        if (!res.ok) {
          setMsg({ ok: false, text: res.message });
          break;
        }
        totalDone += res.done;
        totalFailed += res.failed;
        router.refresh();
        setMsg({
          ok: true,
          text:
            res.remaining > 0
              ? `${totalDone} ausgelesen … noch ${res.remaining}`
              : `Fertig: ${totalDone} ausgelesen${totalFailed > 0 ? `, ${totalFailed} fehlgeschlagen` : ''}.`,
        });
        // Stop when done or when a batch couldn't make progress (stuck items).
        if (res.remaining === 0 || res.done === 0) break;
      }
    } catch {
      setMsg({
        ok: false,
        text: `Abgebrochen (Zeitüberschreitung). ${totalDone} ausgelesen – bitte erneut starten für den Rest.`,
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const run = mode === 'all' ? runAll : runOne;

  if (mode === 'one') {
    return (
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="text-xs text-primary hover:underline disabled:opacity-50"
        title="Mit KI auslesen"
      >
        {busy ? '…' : '🔍 auslesen'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={busy}>
        {busy ? 'Lese aus …' : '🤖 Belege mit KI auslesen'}
      </Button>
      {msg && (
        <Alert variant={msg.ok ? 'default' : 'destructive'} className="py-1 text-xs">
          {msg.text}
        </Alert>
      )}
    </div>
  );
}
