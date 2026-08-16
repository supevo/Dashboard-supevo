'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { convertLeadToClientAction } from '@/features/leads/actions';

/**
 * „Lead gewonnen" → legt aus dem Angebot einen Kunden inkl. Mitgliedschaft an.
 * Ist der Lead bereits umgewandelt, verlinkt der Button direkt auf den Kunden.
 */
export function LeadConvertButton({
  leadId,
  convertedClientCompanyId,
}: {
  leadId: string;
  convertedClientCompanyId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(convertedClientCompanyId);

  async function convert() {
    if (
      !window.confirm(
        'Diesen Lead als Kunden übernehmen? Es wird ein Kundenunternehmen und eine Mitgliedschaft aus dem aktuellen Paket angelegt.',
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await convertLeadToClientAction(leadId);
    setBusy(false);
    if (res.status === 'success') {
      const id = (res.data as { id?: string } | undefined)?.id ?? null;
      setDoneId(id);
      router.refresh();
    } else {
      setMsg('message' in res ? (res.message ?? 'Fehlgeschlagen.') : 'Fehlgeschlagen.');
    }
  }

  if (doneId) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-emerald-600 dark:text-emerald-400">
          ✅ Als Kunde übernommen.
        </span>
        <Link
          href={`/app/clients/${doneId}`}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          Zum Kunden →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" onClick={convert} disabled={busy}>
        {busy ? 'Übernehme …' : '✅ Lead gewonnen – als Kunde übernehmen'}
      </Button>
      {msg && <Alert className="py-1 text-xs text-destructive">{msg}</Alert>}
    </div>
  );
}
