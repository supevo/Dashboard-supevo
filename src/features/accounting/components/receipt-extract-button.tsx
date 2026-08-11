'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { extractReceiptAction } from '@/features/accounting/receipt-extract-actions';
import { useReceiptExtraction } from '@/features/accounting/components/use-receipt-extraction';
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
  const {
    busy: allBusy,
    msg: allMsg,
    runAll,
  } = useReceiptExtraction(id);
  const [oneBusy, setOneBusy] = useState(false);
  const [oneMsg, setOneMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  async function runOne() {
    setOneBusy(true);
    setOneMsg(null);
    try {
      const res = await extractReceiptAction(id);
      const text = 'message' in res ? (res.message ?? '') : '';
      setOneMsg({ ok: res.status === 'success', text });
      if (res.status === 'success') router.refresh();
    } catch {
      setOneMsg({ ok: false, text: 'Auslesen fehlgeschlagen. Bitte erneut versuchen.' });
    } finally {
      setOneBusy(false);
    }
  }

  const busy = mode === 'all' ? allBusy : oneBusy;
  const msg = mode === 'all' ? allMsg : oneMsg;
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
