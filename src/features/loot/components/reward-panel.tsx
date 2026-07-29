'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { openBoxAction, redeemItemAction } from '@/features/loot/actions';
import type { ShopData } from '@/features/loot/queries';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const BOX_META: Record<string, { label: string; emoji: string; ring: string }> = {
  common: { label: 'Common', emoji: '📦', ring: 'border-slate-400/50' },
  rare: { label: 'Rare', emoji: '🎁', ring: 'border-sky-400/60' },
  super: { label: 'Super Rare', emoji: '💎', ring: 'border-fuchsia-400/60' },
};

interface Reveal {
  name: string;
  emoji: string;
  type: string;
  imageUrl: string | null;
}

export function RewardPanel({ shop }: { shop: ShopData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);

  // Opening animation: while a box video plays we hold the drawn item back and
  // only reveal it once the video has finished (or is skipped).
  const [openingVideo, setOpeningVideo] = useState<string | null>(null);
  const [videoDone, setVideoDone] = useState(false);
  const [pendingReveal, setPendingReveal] = useState<Reveal | null>(null);

  // When both the video finished and the item was drawn, show the reveal.
  useEffect(() => {
    if (openingVideo && videoDone && pendingReveal) {
      setOpeningVideo(null);
      setVideoDone(false);
      setReveal(pendingReveal);
      setPendingReveal(null);
    }
  }, [openingVideo, videoDone, pendingReveal]);

  function open(tier: string, free: boolean) {
    setError(null);
    const box = shop.boxes.find((b) => b.tier === tier);
    const video = box?.videoUrl ?? null;
    if (video) {
      setVideoDone(false);
      setPendingReveal(null);
      setOpeningVideo(video);
    }
    start(async () => {
      const res = await openBoxAction(tier, { free });
      if (res.status !== 'success') {
        if (res.status === 'error') setError(res.message);
        setOpeningVideo(null);
        return;
      }
      const d = res.data as
        | { name?: string; badgeEmoji?: string; type?: string; imageUrl?: string | null }
        | undefined;
      const drawn: Reveal = {
        name: d?.name ?? 'Item',
        emoji: d?.badgeEmoji ?? '🎁',
        type: d?.type ?? 'physical',
        imageUrl: d?.imageUrl ?? null,
      };
      if (video) {
        setPendingReveal(drawn);
      } else {
        setReveal(drawn);
      }
      router.refresh();
    });
  }

  function redeem(id: string) {
    setError(null);
    start(async () => {
      const res = await redeemItemAction(id);
      if (res.status === 'error') setError(res.message);
      router.refresh();
    });
  }

  // Nur noch nicht eingelöste Items zeigen; eingelöste verschwinden sofort
  // aus dem Inventar (die Zeile bleibt in der DB für die Admin-Übersicht).
  const openItems = shop.inventory.filter((it) => it.status === 'new');

  return (
    <div className="space-y-6">
      {/* Balance */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div>
          <div className="text-xs text-muted-foreground">Dein Guthaben</div>
          <div className="text-2xl font-bold">🪙 {shop.balance} Coins</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          gesammelt: {shop.earned} · ausgegeben: {shop.spent}
          <br />1 Coin je {shop.config.xpPerCoin} XP
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {/* Boxes */}
      <div className="grid gap-4 sm:grid-cols-3">
        {shop.boxes.map((b) => {
          const meta = BOX_META[b.tier]!;
          const canBuy = shop.balance >= b.price && b.itemCount > 0 && !pending;
          const canFree = b.free > 0 && b.itemCount > 0 && !pending;
          return (
            <div
              key={b.tier}
              className={cn(
                'flex flex-col items-center gap-3 rounded-xl border-2 bg-card p-6 text-center',
                meta.ring,
              )}
            >
              {b.artUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.artUrl}
                  alt={meta.label}
                  className="h-48 w-48 rounded-lg object-contain"
                />
              ) : (
                <span className="text-8xl" aria-hidden>
                  {meta.emoji}
                </span>
              )}
              <div className="text-lg font-semibold">{meta.label}</div>
              {b.free > 0 && (
                <div className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  🎁 {b.free} Gratis-Box{b.free > 1 ? 'en' : ''}
                </div>
              )}
              <div className="text-sm text-muted-foreground">🪙 {b.price} Coins</div>
              {b.itemCount === 0 ? (
                <div className="text-xs text-muted-foreground">Noch keine Items</div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  {b.free > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canFree}
                      onClick={() => open(b.tier, true)}
                    >
                      Gratis öffnen
                    </Button>
                  )}
                  <Button size="sm" disabled={!canBuy} onClick={() => open(b.tier, false)}>
                    Öffnen
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Inventory – nur noch nicht eingelöste Items; eingelöste verschwinden direkt */}
      <div>
        <h2 className="mb-2 text-lg font-semibold">Dein Inventar</h2>
        {openItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch nichts gewonnen. Öffne eine Box!</p>
        ) : (
          <ul className="space-y-2">
            {openItems.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.imageUrl}
                    alt={it.name}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <span className="text-2xl" aria-hidden>
                    {it.type === 'badge' ? it.badgeEmoji ?? '🏅' : '🎁'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{it.name}</span>
                    {it.type === 'badge' && (
                      <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">digital</span>
                    )}
                  </div>
                  {it.description && <div className="text-xs text-muted-foreground">{it.description}</div>}
                </div>
                <Button size="sm" disabled={pending} onClick={() => redeem(it.id)}>
                  Einlösen
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Opening animation (box video) – plays before the reveal */}
      {openingVideo && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-4">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={openingVideo}
            autoPlay
            muted
            playsInline
            onEnded={() => setVideoDone(true)}
            onError={() => setVideoDone(true)}
            className="max-h-[70vh] w-auto max-w-full"
          />
          {videoDone && !pendingReveal && (
            <p className="text-sm text-neutral-500">Box wird geöffnet …</p>
          )}
        </div>
      )}

      {/* Reveal */}
      <Modal open={reveal !== null} onClose={() => setReveal(null)} title="🎉 Gewonnen!">
        {reveal && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            {reveal.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={reveal.imageUrl}
                alt={reveal.name}
                className="h-32 w-32 rounded-lg object-contain"
              />
            ) : (
              <span className="text-6xl" aria-hidden>
                {reveal.emoji}
              </span>
            )}
            <div className="text-xl font-bold">{reveal.name}</div>
            <p className="text-sm text-muted-foreground">
              {reveal.type === 'badge'
                ? 'Digitales Item – im Inventar auf „Einlösen" tippen, dann landet es direkt in deinem Profil.'
                : 'Landet in deinem Inventar. Zum Einlösen dort auf „Einlösen" tippen.'}
            </p>
            <Button size="sm" onClick={() => setReveal(null)}>Weiter</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
