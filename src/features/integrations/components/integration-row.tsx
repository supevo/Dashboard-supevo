'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  loadSearchConsoleAction,
  disconnectGoogleAction,
} from '@/features/integrations/actions';
import type { SearchQueryRow } from '@/lib/integrations/google';
import { Button } from '@/components/ui/button';

/**
 * Eine Kundenzeile in der Integrationsübersicht: verbinden (Google-OAuth),
 * on-demand Kennzahlen laden (Top-Suchanfragen der letzten 28 Tage) und trennen.
 */
export function IntegrationRow({
  clientCompanyId,
  clientName,
  connected,
  siteUrl,
}: {
  clientCompanyId: string;
  clientName: string;
  connected: boolean;
  siteUrl: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<SearchQueryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function load() {
    setError(null);
    start(async () => {
      const res = await loadSearchConsoleAction(clientCompanyId);
      if (!res.ok) {
        setError(res.error);
        setRows(null);
        return;
      }
      setRows(res.rows);
      setOpen(true);
    });
  }

  function disconnect() {
    if (!window.confirm(`Google-Verbindung für ${clientName} trennen?`)) return;
    start(async () => {
      const res = await disconnectGoogleAction(clientCompanyId);
      if (!res.ok) {
        setError(res.error ?? 'Trennen fehlgeschlagen.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-medium">{clientName}</span>
          {connected ? (
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              Verbunden
            </span>
          ) : (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              Nicht verbunden
            </span>
          )}
          {connected && siteUrl && (
            <span className="ml-2 truncate text-xs text-muted-foreground">
              {siteUrl}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={load}>
                {pending ? 'Lädt …' : '📊 Daten laden'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={disconnect}
              >
                Trennen
              </Button>
            </>
          ) : (
            <a
              href={`/api/integrations/google/connect?client=${clientCompanyId}`}
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Mit Google verbinden
            </a>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {open && rows && (
        <div className="mt-3 overflow-x-auto rounded-md border">
          {rows.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              Keine Daten im Zeitraum (letzte 28 Tage).
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Suchanfrage</th>
                  <th className="px-3 py-2 text-right font-medium">Klicks</th>
                  <th className="px-3 py-2 text-right font-medium">Impr.</th>
                  <th className="px-3 py-2 text-right font-medium">Ø Position</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.query} className="border-t">
                    <td className="px-3 py-1.5">{r.query}</td>
                    <td className="px-3 py-1.5 text-right">{r.clicks}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">
                      {r.impressions}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      {r.position.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
