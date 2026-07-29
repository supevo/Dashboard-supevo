'use client';

import { useEffect, useRef, useState } from 'react';
import { sendStickerAction } from '@/features/messenger/actions';
import type { StickerItem } from '@/features/messenger/queries';

/**
 * Chat sticker picker: opens a grid of the team's stickers; clicking one sends
 * it into the channel immediately and calls onSent so the pane reloads.
 */
export function StickerPicker({
  channelId,
  onSent,
}: {
  channelId: string;
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [stickers, setStickers] = useState<StickerItem[] | null>(null);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (stickers === null) {
      void (async () => {
        try {
          const res = await fetch('/api/chat-stickers/list', { cache: 'no-store' });
          if (!res.ok) {
            setStickers([]);
            return;
          }
          const data = (await res.json()) as { stickers: StickerItem[] };
          setStickers(data.stickers ?? []);
        } catch {
          setStickers([]);
        }
      })();
    }
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
  }, [open, stickers]);

  async function pick(id: string) {
    if (sending) return;
    setSending(true);
    try {
      const res = await sendStickerAction(channelId, id);
      if (res.ok) {
        setOpen(false);
        onSent();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Sticker senden"
        className="flex h-9 w-9 items-center justify-center rounded-md text-lg hover:bg-muted"
      >
        🖼️
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-lg border bg-card p-2 shadow-xl">
          {stickers === null ? (
            <p className="p-2 text-sm text-muted-foreground">Lädt …</p>
          ) : stickers.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              Noch keine Sticker. In den Einstellungen hochladen.
            </p>
          ) : (
            <div className="grid max-h-56 grid-cols-4 gap-1 overflow-y-auto">
              {stickers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={sending}
                  onClick={() => void pick(s.id)}
                  title={s.name}
                  className="flex items-center justify-center rounded p-1 hover:bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt={s.name} className="h-12 w-12 object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
