'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setLeagueSymbolsAction } from '@/features/gamification/league-symbols-actions';
import { LEAGUES } from '@/features/gamification/leagues';
import type { LeagueSymbolOverride } from '@/features/gamification/league-symbols';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/ui/submit-button';

/**
 * Admin control to set a custom symbol per league: either an emoji (text input,
 * saved with the form) or an uploaded image (PNG/WebP/SVG, uploaded immediately).
 * An uploaded image takes precedence over the emoji. Empty = code default.
 */
export function LeagueSymbolsForm({
  symbols,
}: {
  symbols: Record<string, LeagueSymbolOverride>;
}) {
  const [state, formAction] = useActionState(setLeagueSymbolsAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Lege je Liga ein eigenes Symbol fest: entweder ein Emoji oder ein
        hochgeladenes Bild (PNG, WebP, SVG). Ein Bild hat Vorrang. Leer lassen =
        Standard.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {LEAGUES.map((l) => (
          <LeagueSymbolRow
            key={l.key}
            leagueKey={l.key}
            name={l.name}
            color={l.color}
            emoji={l.emoji}
            override={symbols[l.key]}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton size="sm">Emojis speichern</SubmitButton>
        {state.status === 'error' && (
          <Alert variant="destructive" className="flex-1">
            {state.message}
          </Alert>
        )}
        {state.status === 'success' && (
          <Alert className="flex-1">{state.message}</Alert>
        )}
      </div>
    </form>
  );
}

function LeagueSymbolRow({
  leagueKey,
  name,
  color,
  emoji,
  override,
}: {
  leagueKey: string;
  name: string;
  color: string;
  emoji: string;
  override: LeagueSymbolOverride | undefined;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasImage = Boolean(override?.hasImage);
  // A per-render token busts the browser cache after an upload/reset.
  const [token, setToken] = useState(0);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await fetch(`/api/league-icons/${leagueKey}`, {
        method: 'POST',
        body,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Upload fehlgeschlagen.');
        return;
      }
      setToken((t) => t + 1);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/league-icons/${leagueKey}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Zurücksetzen fehlgeschlagen.');
        return;
      }
      setToken((t) => t + 1);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border p-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/league-icons/${leagueKey}?t=${token}`}
            alt={name}
            width={32}
            height={32}
            style={{ width: 32, height: 32, objectFit: 'contain' }}
          />
        ) : (
          <span className="text-xl" aria-hidden>
            {override?.symbol || emoji}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium" style={{ color }}>
          {name}
        </span>
        <span className="block text-xs text-muted-foreground">
          Standard: {emoji}
        </span>
        {error && <span className="block text-xs text-destructive">{error}</span>}
      </span>
      <div className="flex flex-col items-end gap-1.5">
        <Input
          name={`sym_${leagueKey}`}
          defaultValue={override?.symbol ?? ''}
          placeholder={emoji}
          maxLength={8}
          className="h-9 w-16 text-center text-lg"
          aria-label={`Emoji für ${name}`}
        />
        <div className="flex items-center gap-1.5">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? '…' : hasImage ? 'Ersetzen' : 'Bild'}
          </Button>
          {hasImage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void reset()}
              aria-label={`Bild für ${name} entfernen`}
            >
              ✕
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
