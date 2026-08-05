'use client';

import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Adds drag & drop to any existing upload control. Wrap a trigger that contains
 * a hidden `<input type="file">` (plus its button/label): dropped files are
 * assigned to that input and its native `change` event is fired, so the
 * component's existing upload handler runs unchanged — no per-field wiring.
 */
export function DropZone({
  children,
  className,
  disabled = false,
  overlayLabel = 'Dateien hier ablegen',
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  overlayLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const input = ref.current?.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    if (!input || input.disabled) return;
    try {
      input.files = files; // hand the dropped files to the existing input
    } catch {
      return; // some browsers disallow assigning files – give up silently
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  return (
    <div
      ref={ref}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={onDrop}
      className={cn(
        'relative rounded-md transition-colors',
        over && 'bg-primary/5 outline-dashed outline-2 outline-offset-2 outline-primary',
        className,
      )}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
          {overlayLabel}
        </div>
      )}
    </div>
  );
}
