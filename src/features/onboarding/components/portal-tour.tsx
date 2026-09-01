'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { markPortalTourSeenAction } from '@/features/onboarding/portal-tour-actions';

interface Step {
  selector: string | null; // null = centered step (no target)
  title: string;
  body: string;
  place?: 'top' | 'bottom' | 'left' | 'right';
}

/** Custom event other components dispatch to (re)start the tour manually. */
export const TOUR_EVENT = 'supevo:portal-tour';

// Steps target sections on the portal overview via data-tour markers. Sections
// that aren't rendered (e.g. onboarding already done) are skipped automatically.
const STEPS: Step[] = [
  {
    selector: '[data-tour="onboarding"]',
    title: 'Zuerst: Ihr Onboarding',
    body: 'Hier erledigen Sie die letzten Einrichtungsschritte – z. B. die Zustimmung zu Ihrem Marketingplan. Erst danach geht es richtig los.',
    place: 'bottom',
  },
  {
    selector: '[data-tour="account-managers"]',
    title: 'Ihr persönlicher Ansprechpartner',
    body: 'Egal welche Frage Sie haben – schreiben Sie über den Chat oder WhatsApp oder vereinbaren Sie direkt einen Termin. Ihr Ansprechpartner meldet sich bei Ihnen.',
    place: 'bottom',
  },
  {
    selector: '[data-tour="assets"]',
    title: 'Zugänge & Logos hinterlegen',
    body: 'Hinterlegen Sie hier Ihre Login-Daten (verschlüsselt gespeichert) und laden Sie Ihre Logos & Marken-Dateien hoch – so können wir sofort für Sie arbeiten.',
    place: 'bottom',
  },
  {
    selector: '[data-tour="tasks"]',
    title: 'Ihre Aufgaben auf einen Blick',
    body: 'Offen, in Bearbeitung und zur Freigabe: So sehen Sie jederzeit den aktuellen Stand Ihrer Themen.',
    place: 'bottom',
  },
  {
    selector: '[data-tour="week"]',
    title: 'Was wir diese Woche getan haben',
    body: 'Hier fassen wir zusammen, woran wir gerade für Sie arbeiten und was zuletzt fertig geworden ist.',
    place: 'top',
  },
  {
    selector: '[data-tour="news"]',
    title: 'Neuigkeiten & Impulse',
    body: 'Passende Neuigkeiten und Tipps zu Ihren Themen – frisch zusammengestellt.',
    place: 'top',
  },
  {
    selector: '[data-tour="satisfaction"]',
    title: 'Ihre Bewertung zählt',
    body: 'Sagen Sie uns mit einem Klick, wie zufrieden Sie sind. So können wir uns laufend verbessern.',
    place: 'top',
  },
  {
    selector: null,
    title: 'Sie sind startklar! 🎉',
    body: 'Das war die kurze Tour. Sie können sie jederzeit oben über „Kurze Tour" erneut ansehen. Viel Erfolg!',
  },
];

const DIM = 'rgba(9,13,20,0.66)';

export function PortalTour({ autoStart }: { autoStart: boolean }) {
  const [running, setRunning] = useState(false);
  const [idx, setIdx] = useState(0);
  const stepsRef = useRef<Step[]>([]);
  const ringRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const finish = useCallback(() => {
    setRunning(false);
    void markPortalTourSeenAction();
  }, []);

  const start = useCallback(() => {
    // Only include steps whose target actually exists (conditional sections).
    stepsRef.current = STEPS.filter(
      (s) => s.selector === null || document.querySelector(s.selector),
    );
    if (stepsRef.current.length <= 1) {
      // Nothing meaningful to show – mark seen so it doesn't keep trying.
      void markPortalTourSeenAction();
      return;
    }
    setIdx(0);
    setRunning(true);
  }, []);

  // Auto-start once on first login; also mark seen even if it never really ran.
  useEffect(() => {
    if (!autoStart) return;
    const t = setTimeout(() => start(), 600);
    return () => clearTimeout(t);
  }, [autoStart, start]);

  // Manual (re)start via the replay button.
  useEffect(() => {
    const handler = () => start();
    window.addEventListener(TOUR_EVENT, handler);
    return () => window.removeEventListener(TOUR_EVENT, handler);
  }, [start]);

  const place = useCallback(() => {
    const steps = stepsRef.current;
    const step = steps[idx];
    const ring = ringRef.current;
    const tip = tipRef.current;
    if (!step || !ring || !tip) return;
    const el = step.selector
      ? (document.querySelector(step.selector) as HTMLElement | null)
      : null;

    if (!el) {
      ring.style.display = 'none';
      tip.dataset.place = 'center';
      tip.style.left = Math.round((window.innerWidth - tip.offsetWidth) / 2) + 'px';
      tip.style.top = Math.round((window.innerHeight - tip.offsetHeight) / 2) + 'px';
      return;
    }
    ring.style.display = 'block';
    const pad = 6;
    const r = el.getBoundingClientRect();
    ring.style.top = r.top - pad + 'px';
    ring.style.left = r.left - pad + 'px';
    ring.style.width = r.width + pad * 2 + 'px';
    ring.style.height = r.height + pad * 2 + 'px';

    const gap = 14;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const fits = (pl: string) => {
      if (pl === 'bottom') return r.bottom + gap + th < window.innerHeight;
      if (pl === 'top') return r.top - gap - th > 0;
      if (pl === 'right') return r.right + gap + tw < window.innerWidth;
      if (pl === 'left') return r.left - gap - tw > 0;
      return true;
    };
    let pl = step.place || 'bottom';
    if (!fits(pl)) {
      pl =
        (['bottom', 'top', 'right', 'left'] as const).find((o) => fits(o)) || 'bottom';
    }
    const clampX = (x: number) =>
      Math.min(Math.max(x, 12), window.innerWidth - tw - 12);
    const clampY = (y: number) =>
      Math.min(Math.max(y, 12), window.innerHeight - th - 12);

    let top: number;
    let left: number;
    if (pl === 'bottom') {
      top = r.bottom + gap;
      left = clampX(r.left);
    } else if (pl === 'top') {
      top = r.top - gap - th;
      left = clampX(r.left);
    } else if (pl === 'right') {
      left = r.right + gap;
      top = clampY(r.top);
    } else {
      left = r.left - gap - tw;
      top = clampY(r.top);
    }
    tip.dataset.place = pl;
    tip.style.top = Math.round(top) + 'px';
    tip.style.left = Math.round(left) + 'px';
  }, [idx]);

  // Position on step change / resize while running.
  useEffect(() => {
    if (!running) return;
    const step = stepsRef.current[idx];
    const el = step?.selector
      ? (document.querySelector(step.selector) as HTMLElement | null)
      : null;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 70) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    const t = setTimeout(place, 80);
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [running, idx, place]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, idx, finish]);

  function go(dir: 1 | -1) {
    const last = stepsRef.current.length - 1;
    setIdx((i) => {
      const n = i + dir;
      if (n < 0) return 0;
      if (n > last) {
        finish();
        return i;
      }
      return n;
    });
  }

  if (!running) return null;
  const steps = stepsRef.current;
  const step = steps[idx];
  if (!step) return null;
  const isLast = idx === steps.length - 1;

  return (
    <div aria-live="polite">
      {/* Click-blocker (transparent; the dim comes from the ring's box-shadow or,
          on centered steps, from this layer). */}
      <div
        className="fixed inset-0 z-[1000]"
        style={step.selector ? undefined : { background: DIM }}
      />
      {/* Spotlight ring */}
      <div
        ref={ringRef}
        className="pointer-events-none fixed z-[1001] rounded-xl transition-all duration-300"
        style={{
          boxShadow: `0 0 0 9999px ${DIM}, 0 0 0 3px hsl(var(--primary))`,
        }}
      />
      {/* Tooltip */}
      <div
        ref={tipRef}
        role="dialog"
        aria-modal="true"
        className="fixed z-[1002] w-[min(340px,calc(100vw-32px))] rounded-2xl border bg-background p-4 shadow-2xl transition-[top,left] duration-300"
      >
        <div className="text-[11px] font-bold uppercase tracking-wider text-primary">
          Schritt {idx + 1} von {steps.length}
        </div>
        <h3 className="mt-1.5 text-base font-semibold text-foreground">
          {step.title}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>
        <div className="mt-3 flex gap-1">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i <= idx ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          {!isLast && (
            <button
              type="button"
              onClick={finish}
              className="mr-auto rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Überspringen
            </button>
          )}
          {idx > 0 && (
            <button
              type="button"
              onClick={() => go(-1)}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              Zurück
            </button>
          )}
          <button
            type="button"
            onClick={() => go(1)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {isLast ? 'Fertig' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small button that (re)starts the tour – place it in the portal header. */
export function TourReplayButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}
      className="rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted"
    >
      🧭 Kurze Tour
    </button>
  );
}
