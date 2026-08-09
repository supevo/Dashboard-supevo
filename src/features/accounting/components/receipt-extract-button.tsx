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

  async function run() {
    setBusy(true);
    setMsg(null);
    const res =
      mode === 'all'
        ? await extractOpenReceiptsAction(id)
        : await extractReceiptAction(id);
    setBusy(false);
    const text = 'message' in res ? (res.message ?? '') : '';
    setMsg({ ok: res.status === 'success', text });
    if (res.status === 'success') router.refresh();
  }

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
