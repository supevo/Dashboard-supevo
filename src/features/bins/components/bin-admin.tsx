'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadBinIcsAction } from '@/features/bins/actions';
import type { BinCoverage } from '@/features/bins/queries';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Admin: ICS-Datei der Müllabfuhr hochladen + Reichweite sehen. Die Termine
 * werden beim Ausstempeln fair an Mitarbeiter verteilt (rausstellen/reinnehmen).
 */
export function BinAdmin({ coverage }: { coverage: BinCoverage }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onFile(file: File) {
    setMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      start(async () => {
        const res = await uploadBinIcsAction({
          filename: file.name,
          content: String(reader.result),
        });
        setMsg({ ok: res.status === 'success', text: 'message' in res ? res.message ?? '' : '' });
        if (res.status === 'success') router.refresh();
      });
    };
    reader.onerror = () => setMsg({ ok: false, text: 'Datei konnte nicht gelesen werden.' });
    reader.readAsText(file);
  }

  const soon =
    coverage.coverageEnd &&
    new Date(coverage.coverageEnd).getTime() - Date.now() < 14 * 86_400_000;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <div className="text-xs text-muted-foreground">Kalender reicht bis</div>
          <div className={`font-semibold ${soon ? 'text-amber-600' : ''}`}>
            {fmt(coverage.coverageEnd)}
            {soon && ' · bitte neue ICS hochladen'}
          </div>
        </div>
        {coverage.filename && (
          <div>
            <div className="text-xs text-muted-foreground">Datei</div>
            <div className="font-medium">{coverage.filename}</div>
          </div>
        )}
      </div>

      {coverage.upcoming.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nächste Termine
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {coverage.upcoming.map((u, i) => (
              <li key={i} className="flex items-center justify-between rounded border px-2 py-1">
                <span>{u.label}</span>
                <span className="text-muted-foreground">{fmt(u.date)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {msg && (
        <Alert variant={msg.ok ? 'success' : 'destructive'} className="text-xs">
          {msg.text}
        </Alert>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Lädt …' : 'ICS hochladen'}
      </Button>
      <p className="text-xs text-muted-foreground">
        ICS deines Entsorgers hochladen. Erkennt Rest-, Bio-, Gelbe und Blaue
        Tonne automatisch. „Rausstellen“ wird am Vorabend, „Reinnehmen“ am
        Abfuhrtag beim Ausstempeln zugeteilt.
      </p>
    </div>
  );
}
