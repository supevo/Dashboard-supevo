'use client';

import { useState, useTransition } from 'react';
import {
  allBanners,
  isBannerAvailable,
  DEFAULT_BANNER_KEY,
  type CustomBanner,
} from '@/features/gamification/banners';
import { setBannerAction } from '@/features/gamification/actions';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

/**
 * Titelbild-Auswahl für den Level Hub. Öffnet ein Overlay mit allen (Standard +
 * hochgeladenen) Titelbildern als Kacheln. Freigeschaltete (Level erreicht)
 * sind auswählbar, gesperrte sind abgedunkelt und zeigen das nötige Level.
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-white/40 bg-black/25 px-3 py-1 text-xs font-medium text-white backdrop-blur transition hover:bg-black/40"
      >
        🎨 Titelbild
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Titelbild wählen">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {banners.map((b) => {
            const unlocked = isBannerAvailable(b, level);
            const active = current === b.key;
            return (
              <button
                type="button"
                key={b.key}
                disabled={!unlocked || pending}
                onClick={() => unlocked && choose(b.key)}
                title={
                  unlocked
                    ? b.name
                    : b.exclusive
                      ? `${b.name} – nur über Lootbox`
                      : `${b.name} – ab Level ${b.unlockLevel}`
                }
                className={cn(
                  'group relative h-20 overflow-hidden rounded-lg border text-left transition',
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
                  <span className="truncate rounded bg-black/45 px-1 text-[10px] font-medium text-white">
                    {b.name}
                  </span>
                  {active && (
                    <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">
                      ✓
                    </span>
                  )}
                  {!unlocked && (
                    <span className="shrink-0 rounded bg-black/55 px-1 text-[10px] text-white">
                      {b.exclusive ? '🔒 🎁' : `🔒 ${b.unlockLevel}`}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {banners.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Noch keine Titelbilder verfügbar.
          </p>
        )}
      </Modal>
    </>
  );
}
