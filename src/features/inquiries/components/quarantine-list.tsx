'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteQuarantineAction,
  assignQuarantineAction,
} from '@/features/inquiries/quarantine-actions';
import { quarantineReasonLabel, type QuarantineItem } from '@/features/inquiries/quarantine-types';
import { Button } from '@/components/ui/button';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function Row({
  item,
  clients,
}: {
  item: QuarantineItem;
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [client, setClient] = useState('');
  const [error, setError] = useState<string | null>(null);

  const del = () => {
    if (!window.confirm('Diese Mail endgültig verwerfen?')) return;
    start(async () => {
      const res = await deleteQuarantineAction(item.id);
      if (!res.ok) setError(res.error ?? 'Fehlgeschlagen.');
      else router.refresh();
    });
  };
  const assign = () => {
    if (!client) return;
    setError(null);
    start(async () => {
      const res = await assignQuarantineAction({ id: item.id, clientCompanyId: client });
      if (!res.ok) setError(res.error ?? 'Fehlgeschlagen.');
      else router.refresh();
    });
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{item.subject || '(kein Betreff)'}</div>
          <div className="text-xs text-muted-foreground">
            {fmt(item.createdAt)}
            {item.fromAddress ? ` · von ${item.fromAddress}` : ''}
          </div>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          {quarantineReasonLabel(item.reason)}
        </span>
      </div>

      {item.toAddresses.length > 0 && (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          An: {item.toAddresses.join(', ')}
        </p>
      )}
      {item.body && (
        <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm">
          {item.body}
        </p>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={client}
          onChange={(e) => setClient(e.target.value)}
          disabled={pending}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Kunde wählen …</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button type="button" size="sm" disabled={pending || !client} onClick={assign}>
          Als Anfrage zuordnen
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={del}>
          Verwerfen
        </Button>
      </div>
    </div>
  );
}

export function QuarantineList({
  items,
  clients,
}: {
  items: QuarantineItem[];
  clients: { id: string; name: string }[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Keine Mails in Quarantäne. 🎉
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Row key={item.id} item={item} clients={clients} />
      ))}
    </div>
  );
}
