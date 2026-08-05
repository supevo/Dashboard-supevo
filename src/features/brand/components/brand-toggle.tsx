'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBrandAction } from '@/features/brand/actions';
import type { Brand } from '@/lib/brand';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Brand; label: string; hint: string; swatch: string }[] = [
  {
    value: 'supevo',
    label: 'Supevo',
    hint: 'Warmer Look, Aurora-Verläufe',
    swatch: 'linear-gradient(135deg, #f7b733, #f97316 30%, #e11d48 62%, #7c3aed)',
  },
  {
    value: 'classic',
    label: 'Klassisch',
    hint: 'Ursprüngliches Blau',
    swatch: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
  },
];

/** Live design switch (per browser). Rendered in admin settings. */
export function BrandToggle({ current }: { current: Brand }) {
  const router = useRouter();
  const [active, setActive] = useState<Brand>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function choose(value: Brand) {
    if (value === active) return;
    const prev = active;
    setActive(value); // optimistic
    setError(null);
    start(async () => {
      const res = await setBrandAction(value);
      if (!res.ok) {
        setActive(prev);
        setError(res.error);
        return;
      }
      router.refresh(); // re-render with the new data-brand from the layout
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            disabled={pending}
            aria-pressed={active === o.value}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 text-left transition disabled:opacity-70',
              active === o.value
                ? 'border-primary ring-2 ring-primary/30'
                : 'border-border hover:bg-muted',
            )}
          >
            <span
              className="h-10 w-10 shrink-0 rounded-md border"
              style={{ backgroundImage: o.swatch }}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium">
                {o.label}
                {active === o.value && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                    aktiv
                  </span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Gilt für diesen Browser und wirkt sofort. Betrifft nur die Optik, keine
        Daten.
      </p>
    </div>
  );
}
