'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setXpBoostActiveAction,
  deleteXpBoostAction,
} from '@/features/gamification/xp-boost-actions';
import type { AdminXpBoost } from '@/features/gamification/xp-boost';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function XpBoostAdmin({ boosts }: { boosts: AdminXpBoost[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('Double XP');
  const [factor, setFactor] = useState(2);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [file, setFile] = useState<File | null>(null);

  async function create() {
    setError(null);
    if (!startsAt || !endsAt) {
      setError('Bitte Start und Ende angeben.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('title', title);
      fd.set('factor', String(factor));
      fd.set('startsAt', startsAt);
      fd.set('endsAt', endsAt);
      if (file) fd.set('file', file);
      const res = await fetch('/api/xp-boosts', { method: 'POST', body: fd });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Fehler beim Anlegen.');
      } else {
        setFile(null);
        router.refresh();
      }
    } catch {
      setError('Fehler beim Anlegen.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Aktiviere einen XP-Boost: In diesem Zeitraum wird die automatische XP (Aufgaben,
        Pünktlichkeit, Streaks, Challenges) mit dem Faktor multipliziert. Der Boost wird im
        Level Hub und in der Kollegen-Übersicht als Banner angezeigt.
      </p>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Titel</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Faktor (×)</label>
            <Input
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={factor}
              onChange={(e) => setFactor(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="w-28"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Start</label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Ende</label>
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Banner (optional, empfohlen 1600×500)</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button size="sm" onClick={create} disabled={uploading || pending}>
          {uploading ? 'Wird angelegt …' : 'XP-Boost anlegen'}
        </Button>
      </div>

      {boosts.length > 0 && (
        <ul className="space-y-2">
          {boosts.map((b) => (
            <li
              key={b.id}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-lg border p-3',
                b.isRunning && 'border-amber-400/50 bg-amber-400/10',
              )}
            >
              {b.bannerUrl && (
                <div
                  className="h-10 w-16 shrink-0 rounded border bg-muted"
                  style={{ background: `url("${b.bannerUrl}") center / cover no-repeat` }}
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">⚡ {b.title}</span>
                  <span className="rounded bg-amber-500/15 px-1 text-[10px] text-amber-600 dark:text-amber-400">
                    {b.factor}× XP
                  </span>
                  {b.isRunning && (
                    <span className="rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                      läuft
                    </span>
                  )}
                  {!b.active && (
                    <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">aus</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmt(b.startsAt)} – {fmt(b.endsAt)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => start(async () => { await setXpBoostActiveAction(b.id, !b.active); router.refresh(); })}
                >
                  {b.active ? 'Aus' : 'An'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label="Löschen"
                  onClick={() => start(async () => { await deleteXpBoostAction(b.id); router.refresh(); })}
                >
                  ✕
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
