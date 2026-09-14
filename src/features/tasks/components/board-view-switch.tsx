'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface ClientOption {
  id: string;
  name: string;
}

/**
 * Umschalter für das Board in der Übersicht: „Persönlich" (meine Aufgaben über
 * alle Kunden) oder „Nach Kunde" (Board eines gewählten Kunden). Steuert über
 * die URL-Parameter, damit die Board-Daten serverseitig geladen werden.
 */
export function BoardViewSwitch({
  modus,
  kunde,
  clients,
}: {
  modus: 'persoenlich' | 'kunde';
  kunde: string | null;
  clients: ClientOption[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function go(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params?.toString() ?? '');
    sp.set('tab', 'board');
    for (const [k, v] of Object.entries(next)) {
      if (v == null) sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`/app?${sp.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border bg-card p-1">
        <button
          type="button"
          onClick={() => go({ modus: 'persoenlich', kunde: null })}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
            modus === 'persoenlich' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
          }`}
        >
          👤 Persönlich
        </button>
        <button
          type="button"
          onClick={() =>
            go({ modus: 'kunde', kunde: kunde ?? clients[0]?.id ?? null })
          }
          className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
            modus === 'kunde' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
          }`}
        >
          🔍 Nach Kunde
        </button>
      </div>

      {modus === 'kunde' && (
        <select
          value={kunde ?? ''}
          onChange={(e) => go({ modus: 'kunde', kunde: e.target.value })}
          className="rounded-md border bg-card px-2 py-1.5 text-sm font-semibold text-primary"
          aria-label="Kunde"
        >
          {clients.length === 0 && <option value="">Keine Kunden</option>}
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
