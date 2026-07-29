'use client';

import { useEffect, useRef, useState } from 'react';

const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤩', '🥳',
  '😉', '🙂', '🙃', '😇', '🤔', '🤨', '😐', '😴', '😢', '😭',
  '😤', '😡', '🤯', '😱', '🥵', '🥶', '😬', '🙄', '😏', '🤝',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '✌️', '🤞', '👀', '🔥',
  '✨', '⭐', '🎉', '🎊', '🚀', '💡', '✅', '❌', '⚡', '💯',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '☕', '🍕',
];

/** Small emoji picker button: opens a grid; clicking an emoji calls onPick. */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
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
        aria-label="Emoji einfügen"
        className="flex h-9 w-9 items-center justify-center rounded-md text-lg hover:bg-muted"
      >
        😊
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-lg border bg-card p-2 shadow-xl">
          <div className="grid grid-cols-10 gap-0.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onPick(e);
                  setOpen(false);
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-lg hover:bg-muted"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
