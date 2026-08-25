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
 * "Einstellungen" als zentriertes Popup (Modal) mit verschwommenem Hintergrund,
 * geöffnet über einen Zahnrad-Button. Enthält die Konfigurations-Abschnitte des
 * Kunden (Profil, Onboarding, Abrechnung, …), damit die Haupt-Reiter auf die
 * tägliche Arbeit fokussiert bleiben. Alle Panels bleiben gemountet (per CSS
 * versteckt), damit Formulareingaben beim Abschnittswechsel erhalten bleiben.
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

  // `visible` mountet das Popup, `shown` steuert die Ein-/Ausblende-Animation.
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setVisible(false), 200);
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
        <div
          className={cn(
            'fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200',
            'bg-black/40 backdrop-blur-sm',
            shown ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl transition-all duration-200',
              shown ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
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

            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              {/* Abschnittsliste: mobil oben (horizontal), ab sm links. */}
              <nav className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-48 sm:flex-col sm:gap-0.5 sm:space-y-0.5 sm:overflow-y-auto sm:border-b-0 sm:border-r">
                {sections.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setActive(s.key)}
                    className={cn(
                      'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-2 text-left text-sm transition sm:w-full sm:shrink',
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

              {/* Inhalt */}
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
          </div>
        </div>
      )}
    </>
  );
}
