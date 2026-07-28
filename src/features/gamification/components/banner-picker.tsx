'use client';

import { useState, useTransition } from 'react';
import {
  allBanners,
  DEFAULT_BANNER_KEY,
  type CustomBanner,
} from '@/features/gamification/banners';
import { setBannerAction } from '@/features/gamification/actions';
import { cn } from '@/lib/utils';

/**
 * Titelbild-Auswahl für den Level Hub. Zeigt Verlaufs- und hochgeladene
 * Bild-Titelbilder als Kacheln; freigeschaltete (Level erreicht) sind
 * auswählbar, gesperrte sind abgedunkelt und zeigen das nötige Level.
 */
export function BannerPicker({
  level,
  selected,
  customBanners,
}: {
  level: number;
  selected: string | null;
  customBanners: CustomBanner[];
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(selected ?? DEFAULT_BANNER_KEY);
  const [pending, startTransition] = useTransition();

  const banners = allBanners(customBanners);

  function choose(key: string) {
    setCurrent(key);
    startTransition(() => setBannerAction(key));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-white/40 bg-black/25 px-3 py-1 text-xs font-medium text-white backdrop-blur transition hover:bg-black/40"
      >
        🎨 Titelbild
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 max-h-96 w-72 overflow-y-auto rounded-xl border bg-popover p-3 shadow-lg">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Titelbild wählen
          </div>
          <div className="grid grid-cols-2 gap-2">
            {banners.map((b) => {
              const unlocked = level >= b.unlockLevel;
              const active = current === b.key;
              return (
                <button
                  type="button"
                  key={b.key}
                  disabled={!unlocked || pending}
                  onClick={() => unlocked && choose(b.key)}
                  title={
                    unlocked ? b.name : `${b.name} – ab Level ${b.unlockLevel}`
                  }
                  className={cn(
                    'group relative h-14 overflow-hidden rounded-lg border text-left transition',
                    active ? 'ring-2 ring-primary' : 'border-border',
                    unlocked ? 'cursor-pointer hover:scale-[1.03]' : 'cursor-not-allowed',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn('absolute inset-0', !unlocked && 'opacity-40 grayscale')}
                    style={{ background: b.background }}
                  />
                  <span className="absolute inset-x-1 bottom-1 flex items-center justify-between">
                    <span className="rounded bg-black/40 px-1 text-[10px] font-medium text-white">
                      {b.name}
                    </span>
                    {!unlocked && (
                      <span className="rounded bg-black/50 px-1 text-[10px] text-white">
                        🔒 Lvl {b.unlockLevel}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
