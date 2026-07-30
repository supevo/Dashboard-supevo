'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  allFrames,
  isFrameAvailable,
  type CustomFrame,
} from '@/features/gamification/frames';
import { setFrameAction, buyFrameAction } from '@/features/gamification/actions';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

/**
 * Profilrahmen-Auswahl für den Level Hub. Der gewählte Rahmen ersetzt den
 * XP-Ring um das Profilbild. „Kein Rahmen" stellt den Ring wieder her.
 * Freigeschaltete (Level erreicht, gekauft oder gewonnen) sind wählbar;
 * gesperrte abgedunkelt. Level-Rahmen mit Coin-Preis lassen sich vorzeitig kaufen.
 */
export function FramePicker({
  level,
  selected,
  customFrames,
  coins = 0,
  preview,
  variant = 'pill',
  onOpen,
}: {
  level: number;
  selected: string | null;
  customFrames: CustomFrame[];
  coins?: number;
  /** Avatar für die Vorschau in den Kacheln. */
  preview: { userId: string; name: string; hasAvatar: boolean };
  /** 'pill' = eigenständiger Button, 'menu' = Zeile im Zahnrad-Menü. */
  variant?: 'pill' | 'menu';
  /** Callback, wenn das Modal geöffnet wird (z. B. um das Menü zu schliessen). */
  onOpen?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(selected ?? 'none');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const frames = allFrames(customFrames);

  function choose(key: string) {
    setCurrent(key);
    startTransition(() => setFrameAction(key));
  }

  function buy(id: string, key: string) {
    setError(null);
    startTransition(async () => {
      const res = await buyFrameAction(id);
      if (!res.ok) {
        setError(res.error ?? 'Kauf fehlgeschlagen.');
        return;
      }
      setCurrent(key);
      await setFrameAction(key);
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
        🖼️ <span>{variant === 'menu' ? 'Profilrahmen' : 'Rahmen'}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Profilrahmen wählen">
        <div className="mb-3 text-xs text-muted-foreground">
          Der Rahmen ersetzt den XP-Ring. Dein Guthaben: 🪙 {coins}
        </div>
        {error && (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/* Kein Rahmen → XP-Ring */}
          <button
            type="button"
            disabled={pending}
            onClick={() => choose('none')}
            className={cn(
              'relative flex h-24 flex-col items-center justify-center gap-1 rounded-lg border transition hover:bg-muted',
              current === 'none' || !current ? 'ring-2 ring-primary' : 'border-border',
            )}
          >
            <span className="grid h-12 w-12 place-items-center rounded-full border-[3px] border-primary/70">
              <Avatar {...preview} size="md" style={{ width: 34, height: 34 }} />
            </span>
            <span className="text-[10px] text-muted-foreground">Kein Rahmen (XP-Ring)</span>
          </button>

          {frames.map((f) => {
            const unlocked = isFrameAvailable(f, level);
            const active = current === f.key;
            const buyable = !unlocked && !f.exclusive && f.coinPrice > 0;
            const canAfford = coins >= f.coinPrice;
            return (
              <div
                key={f.key}
                className={cn(
                  'relative h-24 overflow-hidden rounded-lg border',
                  active ? 'ring-2 ring-primary' : 'border-border',
                )}
              >
                {/* Rahmen-Vorschau mit Avatar in der Mitte */}
                <span
                  className={cn(
                    'absolute inset-0 flex items-center justify-center',
                    !unlocked && 'opacity-40 grayscale',
                  )}
                >
                  <span className="relative grid h-16 w-16 place-items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.imageUrl}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                    <Avatar {...preview} size="md" style={{ width: 40, height: 40 }} />
                  </span>
                </span>

                {unlocked && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => choose(f.key)}
                    title={f.name}
                    aria-label={`${f.name} auswählen`}
                    className="absolute inset-0 cursor-pointer transition hover:scale-[1.03]"
                  />
                )}

                <span className="pointer-events-none absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                  <span className="truncate rounded bg-black/45 px-1 text-[10px] font-medium text-white">
                    {f.name}
                  </span>
                  {active && (
                    <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">
                      ✓
                    </span>
                  )}
                  {!unlocked && !buyable && (
                    <span className="shrink-0 rounded bg-black/55 px-1 text-[10px] text-white">
                      {f.exclusive ? '🔒 🎁' : `🔒 ${f.unlockLevel}`}
                    </span>
                  )}
                </span>

                {buyable && (
                  <button
                    type="button"
                    disabled={pending || !canAfford}
                    onClick={() => buy(f.id, f.key)}
                    title={
                      canAfford
                        ? `Für ${f.coinPrice} Coins freischalten (ab Level ${f.unlockLevel} gratis)`
                        : `Nicht genug Coins (${f.coinPrice} nötig)`
                    }
                    className={cn(
                      'absolute right-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                      canAfford
                        ? 'bg-amber-400 text-amber-950 hover:bg-amber-300'
                        : 'cursor-not-allowed bg-black/55 text-white',
                    )}
                  >
                    🪙 {f.coinPrice}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {frames.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Noch keine Profilrahmen verfügbar.
          </p>
        )}
      </Modal>
    </>
  );
}
