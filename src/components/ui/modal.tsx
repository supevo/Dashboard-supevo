'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { de } from '@/lib/i18n/de';

/**
 * Simple accessible modal overlay. Schließt bewusst NUR über das ✕ (bzw. eigene
 * Buttons im Inhalt) – ein Klick auf den Hintergrund schließt NICHT, damit ein
 * versehentlicher Klick daneben (v. a. auf Kundenseite) das Popup nicht instant
 * schließt. `dismissible` schaltet das alte Verhalten (Backdrop + Escape) wieder
 * frei, falls für ein Popup gewünscht.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  dismissible = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  dismissible?: boolean;
}) {
  // Nur clientseitig portalen (SSR kennt document nicht).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissible]);

  if (!open || !mounted) return null;

  // An document.body portalen, damit das fixe Overlay NICHT innerhalb eines
  // transformierten Elements (z. B. dnd-kit-Drag-Container der Kanban-Karten)
  // landet – sonst positioniert sich „fixed" relativ dazu → Fenster-im-Fenster.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={dismissible ? onClose : undefined}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={de.common.close}
            className="rounded-md px-2 text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
