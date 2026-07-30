'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  allBanners,
  isBannerAvailable,
  DEFAULT_BANNER_KEY,
  parseCustomBannerKey,
  type CustomBanner,
} from '@/features/gamification/banners';
import { setBannerAction, buyBannerAction } from '@/features/gamification/actions';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

/**
 * Titelbild-Auswahl für den Level Hub. Freigeschaltete (Level erreicht, gekauft
 * oder gewonnen) sind auswählbar; gesperrte sind abgedunkelt. Level-Titelbilder
 * mit Coin-Preis lassen sich vorzeitig mit Coins kaufen.
 */
export function BannerPicker({
  level,
  selected,
  customBanners,
  coins = 0,
  variant = 'pill',
  onOpen,
}: {
  level: number;
  selected: string | null;
  customBanners: CustomBanner[];
  coins?: number;
  /** 'pill' = eigenständiger Button, 'menu' = Zeile im Zahnrad-Menü. */
  variant?: 'pill' | 'menu';
  /** Callback, wenn das Modal geöffnet wird (z. B. um das Menü zu schliessen). */
  onOpen?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(selected ?? DEFAULT_BANNER_KEY);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const banners = allBanners(customBanners);

  function choose(key: string) {
    setCurrent(key);
    startTransition(() => setBannerAction(key));
  }

  function buy(key: string) {
    const id = parseCustomBannerKey(key);
    if (!id) return;
    setError(null);
    startTransition(async () => {
      const res = await buyBannerAction(id);
      if (!res.ok) {
        setError(res.error ?? 'Kauf fehlgeschlagen.');
        return;
      }
      setCurrent(key);
      await setBannerAction(key);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
        className={
          variant === 'menu'
            ? 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted'
            : 'rounded-full border border-white/40 bg-black/25 px-3 py-1 text-xs font-medium text-white backdrop-blur transition hover:bg-black/40'
        }
      >
        🎨 <span>Titelbild</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Titelbild wählen">
        <div className="mb-3 text-xs text-muted-foreground">Dein Guthaben: 🪙 {coins}</div>
        {error && (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {banners.map((b) => {
            const unlocked = isBannerAvailable(b, level);
            const active = current === b.key;
            const buyable = !unlocked && !b.exclusive && b.coinPrice > 0;
            const canAfford = coins >= b.coinPrice;
            return (
              <div
                key={b.key}
                className={cn(
                  'relative h-20 overflow-hidden rounded-lg border',
                  active ? 'ring-2 ring-primary' : 'border-border',
                )}
              >
                <span
                  aria-hidden
                  className={cn('absolute inset-0', !unlocked && 'opacity-40 grayscale')}
                  style={{ background: b.background }}
                />

                {unlocked && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => choose(b.key)}
                    title={b.name}
                    aria-label={`${b.name} auswählen`}
                    className="absolute inset-0 cursor-pointer transition hover:scale-[1.03]"
                  />
                )}

                <span className="pointer-events-none absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                  <span className="truncate rounded bg-black/45 px-1 text-[10px] font-medium text-white">
                    {b.name}
                  </span>
                  {active && (
                    <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">
                      ✓
                    </span>
                  )}
                  {!unlocked && !buyable && (
                    <span className="shrink-0 rounded bg-black/55 px-1 text-[10px] text-white">
                      {b.exclusive ? '🔒 🎁' : `🔒 ${b.unlockLevel}`}
                    </span>
                  )}
                </span>

                {buyable && (
                  <button
                    type="button"
                    disabled={pending || !canAfford}
                    onClick={() => buy(b.key)}
                    title={
                      canAfford
                        ? `Für ${b.coinPrice} Coins freischalten (ab Level ${b.unlockLevel} gratis)`
                        : `Nicht genug Coins (${b.coinPrice} nötig)`
                    }
                    className={cn(
                      'absolute right-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                      canAfford
                        ? 'bg-amber-400 text-amber-950 hover:bg-amber-300'
                        : 'cursor-not-allowed bg-black/55 text-white',
                    )}
                  >
                    🪙 {b.coinPrice}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {banners.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Titelbilder verfügbar.</p>
        )}
      </Modal>
    </>
  );
}
