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
    let prevRemaining = Infinity;
    try {
      // Enough iterations for large inboxes (batch of 8 → up to ~1600 receipts).
      for (let i = 0; i < 200; i++) {
        // First call clears old failure markers so failed receipts get retried.
        const res = await extractOpenReceiptsAction(id, i === 0);
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
              : `Fertig: ${totalDone} ausgelesen${totalFailed > 0 ? `, ${totalFailed} übersprungen (nicht lesbar)` : ''}.`,
        });
        if (res.remaining === 0) break;
        // Safety: every processed receipt is marked, so remaining must shrink.
        // If it ever doesn't, stop instead of looping forever.
        if (res.remaining >= prevRemaining) break;
        prevRemaining = res.remaining;
      }
    } catch {
      setMsg({
        ok: false,
        text: `Unterbrochen. ${totalDone} ausgelesen – „mit KI auslesen“ erneut klicken, um fortzufahren.`,
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
