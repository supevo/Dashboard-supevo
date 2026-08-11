'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { extractOpenReceiptsAction } from '@/features/accounting/receipt-extract-actions';

export type ExtractMsg = { ok: boolean; text: string } | null;

/**
 * Client-driven KI extraction of all open receipts of one company. Loops in
 * small batches until nothing is left (or a batch makes no progress), so it
 * never hangs on a serverless timeout. Shared by the "Belege mit KI auslesen"
 * button and the auto-run after a OneDrive import.
 */
export function useReceiptExtraction(billingEntityId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ExtractMsg>(null);

  const runAll = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    let totalDone = 0;
    let totalFailed = 0;
    let prevRemaining = Infinity;
    try {
      // Enough iterations for large inboxes (batch of 8 → up to ~1600 receipts).
      for (let i = 0; i < 200; i++) {
        // First call clears old failure markers so failed receipts get retried.
        const res = await extractOpenReceiptsAction(billingEntityId, i === 0);
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
  }, [billingEntityId, router]);

  return { busy, msg, setMsg, runAll };
}
