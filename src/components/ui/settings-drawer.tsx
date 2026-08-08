'use client';

import { useEffect, useState } from 'react';
import { Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DrawerSection {
  key: string;
  label: string;
  /** Optional leading emoji/icon shown in the section list. */
  icon?: string;
  content: React.ReactNode;
}

/**
 * Slide-over "Einstellungen" panel opened from a gear button. Houses the
 * client's configuration sections (profile, onboarding, billing, …) so the main
 * tabs stay focused on day-to-day work. All section panels stay mounted (hidden
 * via CSS) so in-progress form input survives switching sections.
 */
export function SettingsDrawer({
  sections,
  label = 'Einstellungen',
}: {
  sections: DrawerSection[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(sections[0]?.key ?? '');

  // Keep the off-canvas panel OUT of the DOM while closed – a fixed element
  // parked at translate-x-full sits past the right edge and adds a stray
  // scrollbar to the page. `visible` mounts it; `slid` drives the transition.
  const [visible, setVisible] = useState(false);
  const [slid, setSlid] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      const id = requestAnimationFrame(() => setSlid(true));
      return () => cancelAnimationFrame(id);
    }
    setSlid(false);
    const t = setTimeout(() => setVisible(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
      >
        <Settings className="h-4 w-4" />
        {label}
      </button>

      {visible && (
        <>
          {/* Scrim */}
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className={cn(
              'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
              slid ? 'opacity-100' : 'opacity-0',
            )}
          />

          {/* Panel */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={cn(
              'fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l bg-card shadow-2xl transition-transform duration-300',
              slid ? 'translate-x-0' : 'translate-x-full',
            )}
          >
        <header className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Settings className="h-4 w-4" /> {label}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Schließen"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Section list */}
          <nav className="w-44 shrink-0 space-y-0.5 overflow-y-auto border-r p-2">
            {sections.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition',
                  active === s.key
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {s.icon && <span aria-hidden>{s.icon}</span>}
                <span className="min-w-0 truncate">{s.label}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {sections.map((s) => (
              <div
                key={s.key}
                className={cn('space-y-6', active === s.key ? '' : 'hidden')}
              >
                {s.content}
              </div>
            ))}
          </div>
        </div>
          </aside>
        </>
      )}
    </>
  );
}
