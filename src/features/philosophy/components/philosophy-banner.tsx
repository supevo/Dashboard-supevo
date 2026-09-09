'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Schmales Banner ganz oben in der Übersicht, das die Firmenphilosophie
 * vermittelt. Rotiert (mit sanftem Fade) durch die vom Admin gepflegten Texte.
 * Bei nur einem Text bleibt er stehen; ohne Texte wird nichts angezeigt.
 */
export function PhilosophyBanner({ quotes }: { quotes: string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (quotes.length <= 1) return;
    const rotate = setInterval(() => {
      // Ausblenden, Text wechseln, wieder einblenden.
      setVisible(false);
      const swap = setTimeout(() => {
        setIndex((n) => (n + 1) % quotes.length);
        setVisible(true);
      }, 500);
      return () => clearTimeout(swap);
    }, 8000);
    return () => clearInterval(rotate);
  }, [quotes.length]);

  if (quotes.length === 0) return null;
  const current = quotes[Math.min(index, quotes.length - 1)] ?? '';

  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
      <span className="text-lg leading-none" aria-hidden>
        ✨
      </span>
      <p
        className={cn(
          'min-w-0 flex-1 text-sm italic text-foreground/80 transition-opacity duration-500',
          visible ? 'opacity-100' : 'opacity-0',
        )}
      >
        {current}
      </p>
      {quotes.length > 1 && (
        <div className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden>
          {quotes.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 w-1.5 rounded-full transition-colors',
                i === index ? 'bg-primary' : 'bg-primary/25',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
