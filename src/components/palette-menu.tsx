'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PALETTES,
  PALETTE_STORAGE_KEY,
  isPaletteId,
  type PaletteId,
} from '@/lib/palettes';
import { bumpCounter } from '@/features/gamification/actions';
import { cn } from '@/lib/utils';

/**
 * Farbpaletten-Picker im Header. Setzt `data-palette` auf <html> und speichert
 * die Wahl in localStorage; das No-Flash-Skript im Root-Layout wendet sie vor
 * dem Paint an. Der Hell/Dunkel-Modus (ThemeToggle) wirkt obendrauf.
 */
export function PaletteMenu() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<PaletteId>('default');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = document.documentElement.getAttribute('data-palette');
    setActive(isPaletteId(stored) ? stored : 'default');
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(id: PaletteId) {
    if (id === 'default') {
      document.documentElement.removeAttribute('data-palette');
    } else {
      document.documentElement.setAttribute('data-palette', id);
    }
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, id);
    } catch {
      // ignore storage errors (private mode)
    }
    setActive(id);
    setOpen(false);
    void bumpCounter('theme_toggle');
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm hover:bg-muted"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Farbpalette wählen"
        title="Farbpalette wählen"
      >
        <span aria-hidden>🎨</span>
        <span className="hidden sm:inline">Palette</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-72 rounded-md border bg-card p-1 shadow-lg"
        >
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">
            Farbpalette
          </p>
          <div className="max-h-[70vh] overflow-y-auto">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitemradio"
                aria-checked={active === p.id}
                onClick={() => pick(p.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-muted',
                  active === p.id && 'bg-muted',
                )}
              >
                {/* Mini-Vorschau der Palette. */}
                <span
                  className="flex h-9 w-12 flex-shrink-0 flex-col justify-center gap-1 rounded-md border px-1.5"
                  style={{ backgroundColor: p.swatch.bg }}
                  aria-hidden
                >
                  <span
                    className="h-1.5 w-7 rounded-full"
                    style={{ backgroundColor: p.swatch.fg }}
                  />
                  <span
                    className="h-1.5 w-5 rounded-full"
                    style={{ backgroundColor: p.swatch.accent }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {p.label}
                    {active === p.id && (
                      <span className="text-xs text-primary" aria-hidden>
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            Der Hell/Dunkel-Modus wird obendrauf angewendet.
          </p>
        </div>
      )}
    </div>
  );
}
