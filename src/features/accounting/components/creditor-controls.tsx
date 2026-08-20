'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleCreditorAction } from '@/features/accounting/reconcile-actions';

/** Verwaltung der Kreditoren: Chips mit Entfernen + Eingabe zum Hinzufügen. */
export function CreditorManager({
  billingEntityId,
  creditors,
}: {
  billingEntityId: string;
  creditors: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, start] = useTransition();

  const toggle = (n: string, enabled: boolean) =>
    start(async () => {
      const res = await toggleCreditorAction({ billingEntityId, name: n, enabled });
      if (res.status === 'success') {
        setName('');
        router.refresh();
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {creditors.map((c) => (
        <span
          key={c}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
        >
          {c}
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle(c, false)}
            className="text-muted-foreground hover:text-destructive disabled:opacity-40"
            aria-label={`${c} entfernen`}
            title="Aus Kreditoren entfernen"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Anbieter (z. B. Google)"
        disabled={pending}
        className="h-8 rounded border bg-background px-2 text-xs"
      />
      <button
        type="button"
        disabled={pending || name.trim().length < 2}
        onClick={() => toggle(name.trim(), true)}
        className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-40"
      >
        + Kreditor
      </button>
    </div>
  );
}

/** Kleiner Button in „Beleg fehlt": diesen Anbieter als Kreditor führen. */
export function MarkCreditorButton({
  billingEntityId,
  name,
}: {
  billingEntityId: string;
  name: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!name) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await toggleCreditorAction({
            billingEntityId,
            name,
            enabled: true,
          });
          if (res.status === 'success') router.refresh();
        })
      }
      title={`„${name}" über ein Kreditorenkonto führen (kein Einzel-Abgleich)`}
      className="whitespace-nowrap rounded border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
    >
      🏦 Kreditor
    </button>
  );
}
