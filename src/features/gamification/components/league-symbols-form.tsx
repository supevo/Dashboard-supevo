'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setLeagueSymbolsAction } from '@/features/gamification/league-symbols-actions';
import { LEAGUES } from '@/features/gamification/leagues';
import { idleResult } from '@/lib/action-result';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/ui/submit-button';

/**
 * Admin control to set a custom symbol (emoji) per league. Empty = use the code
 * default. The placeholder shows the default so it's clear what "empty" means.
 */
export function LeagueSymbolsForm({
  symbols,
}: {
  symbols: Record<string, string>;
}) {
  const [state, formAction] = useActionState(setLeagueSymbolsAction, idleResult);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Lege je Liga ein eigenes Symbol fest (ein Emoji). Leer lassen = Standard.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {LEAGUES.map((l) => (
          <label
            key={l.key}
            className="flex items-center gap-3 rounded-md border p-2.5"
          >
            <span className="text-xl" aria-hidden>
              {symbols[l.key] || l.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium" style={{ color: l.color }}>
                {l.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                Standard: {l.emoji}
              </span>
            </span>
            <Input
              name={`sym_${l.key}`}
              defaultValue={symbols[l.key] ?? ''}
              placeholder={l.emoji}
              maxLength={8}
              className="h-9 w-16 text-center text-lg"
              aria-label={`Symbol für ${l.name}`}
            />
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton size="sm">Speichern</SubmitButton>
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
