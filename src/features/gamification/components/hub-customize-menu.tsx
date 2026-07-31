'use client';

import { useEffect, useRef, useState } from 'react';
import { FramePicker } from '@/features/gamification/components/frame-picker';
import { BannerPicker } from '@/features/gamification/components/banner-picker';
import type { CustomFrame } from '@/features/gamification/frames';
import type { CustomBanner } from '@/features/gamification/banners';

/**
 * Dezentes Zahnrad, das Profilrahmen- und Titelbild-Auswahl bündelt. Ersetzt die
 * beiden einzelnen Pill-Buttons im Level-Hub-Titelbild durch ein kleines Menü.
 */
export function HubCustomizeMenu({
  level,
  coins,
  frameKey,
  customFrames,
  preview,
  bannerKey,
  customBanners,
}: {
  level: number;
  coins: number;
  frameKey: string | null;
  customFrames: CustomFrame[];
  preview: { userId: string; name: string; hasAvatar: boolean };
  bannerKey: string | null;
  customBanners: CustomBanner[];
}) {
  const [open, setOpen] = useState(false);
  // Welches Modal offen ist. Getrennt vom Menü-Auf-/Zuklappen, damit das Modal
  // erhalten bleibt, wenn das Menü schliesst (sonst würden die Picker mit dem
  // Popup unmounten und das Modal sofort wieder verschwinden – der gemeldete Bug).
  const [active, setActive] = useState<null | 'frame' | 'banner'>(null);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Titelbild & Rahmen anpassen"
        title="Anpassen"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/25 text-sm text-white backdrop-blur transition hover:bg-black/40"
      >
        ⚙️
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-2 w-48 overflow-hidden rounded-lg border bg-card p-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setActive('frame');
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
          >
            🖼️ <span>Profilrahmen</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setActive('banner');
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
          >
            🎨 <span>Titelbild</span>
          </button>
        </div>
      )}

      {/* Immer gemountet, damit die Modals unabhängig vom Menü leben. */}
      <FramePicker
        level={level}
        selected={frameKey}
        customFrames={customFrames}
        coins={coins}
        preview={preview}
        hideTrigger
        open={active === 'frame'}
        onClose={() => setActive(null)}
      />
      <BannerPicker
        level={level}
        selected={bannerKey}
        customBanners={customBanners}
        coins={coins}
        hideTrigger
        open={active === 'banner'}
        onClose={() => setActive(null)}
      />
    </div>
  );
}
