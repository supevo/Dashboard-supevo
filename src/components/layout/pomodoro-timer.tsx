'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Phase = 'focus' | 'break';

interface PomodoroState {
  phase: Phase;
  running: boolean;
  /** Epoch ms when the current phase ends (only meaningful while running). */
  endsAt: number | null;
  /** Remaining ms when paused. */
  remainingMs: number;
  /** Completed focus sprints (for the round dots + long break). */
  rounds: number;
  focusMin: number;
  breakMin: number;
  longBreakMin: number;
}

const STORAGE_KEY = 'supevo:pomodoro';
const DEFAULTS = { focusMin: 25, breakMin: 5, longBreakMin: 15 };
/** A long break replaces the short break every N focus sprints. */
const LONG_BREAK_EVERY = 4;

function freshState(): PomodoroState {
  return {
    phase: 'focus',
    running: false,
    endsAt: null,
    remainingMs: DEFAULTS.focusMin * 60_000,
    rounds: 0,
    ...DEFAULTS,
  };
}

function load(): PomodoroState {
  if (typeof window === 'undefined') return freshState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const s = { ...freshState(), ...(JSON.parse(raw) as Partial<PomodoroState>) };
    return s;
  } catch {
    return freshState();
  }
}

function save(s: PomodoroState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full / disabled – timer still works in-memory */
  }
}

/** How long the given phase should run, in ms, based on config + round count. */
function phaseDuration(s: PomodoroState, phase: Phase): number {
  if (phase === 'focus') return s.focusMin * 60_000;
  const isLong = s.rounds > 0 && s.rounds % LONG_BREAK_EVERY === 0;
  return (isLong ? s.longBreakMin : s.breakMin) * 60_000;
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Short, gentle two-tone chime on phase change (best-effort, no asset needed). */
function chime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [660, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* audio not allowed – ignore */
  }
}

/**
 * Compact Pomodoro focus timer for the sidebar footer. Persists to localStorage
 * as an absolute end-timestamp, so the countdown keeps running across page
 * navigations (the shell re-mounts this component on every route change).
 *
 * Flow: a finished focus sprint auto-starts the break (so you actually rest);
 * a finished break lands on the next focus but paused, so you consciously start
 * the sprint. Every 4th break is a long break.
 */
export function PomodoroTimer() {
  const [state, setState] = useState<PomodoroState>(freshState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(false);

  // Hydrate from storage once (avoids SSR/CSR mismatch).
  useEffect(() => {
    setState(load());
    mounted.current = true;
  }, []);

  // Persist on every change (after hydration).
  useEffect(() => {
    if (mounted.current) save(state);
  }, [state]);

  const remaining = state.running
    ? Math.max(0, (state.endsAt ?? now) - now)
    : state.remainingMs;

  // Advance one phase (called when the timer hits zero).
  const advance = useCallback(() => {
    chime();
    if (typeof document !== 'undefined') {
      // brief tab-title nudge
      const prev = document.title;
      document.title = state.phase === 'focus' ? '✅ Pause!' : '🍅 Fokus!';
      setTimeout(() => {
        document.title = prev;
      }, 4000);
    }
    setState((s) => {
      if (s.phase === 'focus') {
        const rounds = s.rounds + 1;
        const next: PomodoroState = { ...s, phase: 'break', rounds };
        const dur = phaseDuration(next, 'break');
        return { ...next, running: true, endsAt: Date.now() + dur, remainingMs: dur };
      }
      // break finished → next focus, paused
      const next: PomodoroState = { ...s, phase: 'focus' };
      const dur = phaseDuration(next, 'focus');
      return { ...next, running: false, endsAt: null, remainingMs: dur };
    });
  }, [state.phase]);

  // Ticker: only runs while active.
  useEffect(() => {
    if (!state.running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state.running]);

  // Fire the phase transition exactly once when we cross zero.
  useEffect(() => {
    if (state.running && state.endsAt !== null && now >= state.endsAt) {
      advance();
    }
  }, [now, state.running, state.endsAt, advance]);

  function start() {
    setState((s) => ({
      ...s,
      running: true,
      endsAt: Date.now() + s.remainingMs,
    }));
    setNow(Date.now());
  }
  function pause() {
    setState((s) => ({
      ...s,
      running: false,
      remainingMs: Math.max(0, (s.endsAt ?? Date.now()) - Date.now()),
      endsAt: null,
    }));
  }
  function reset() {
    setState((s) => {
      const dur = phaseDuration(s, s.phase);
      return { ...s, running: false, endsAt: null, remainingMs: dur };
    });
  }
  function skip() {
    // Jump straight to the other phase, paused.
    setState((s) => {
      const rounds = s.phase === 'focus' ? s.rounds + 1 : s.rounds;
      const phase: Phase = s.phase === 'focus' ? 'break' : 'focus';
      const next: PomodoroState = { ...s, phase, rounds };
      const dur = phaseDuration(next, phase);
      return { ...next, running: false, endsAt: null, remainingMs: dur };
    });
  }

  function updateConfig(patch: Partial<Pick<PomodoroState, 'focusMin' | 'breakMin' | 'longBreakMin'>>) {
    setState((s) => {
      const merged = { ...s, ...patch };
      // If idle, reflect the new duration immediately in the display.
      if (!s.running) merged.remainingMs = phaseDuration(merged, merged.phase);
      return merged;
    });
  }

  const total = phaseDuration(state, state.phase);
  const progress = total > 0 ? 1 - remaining / total : 0;
  const isFocus = state.phase === 'focus';

  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <span aria-hidden>🍅</span>
          <span className={isFocus ? 'text-primary' : 'text-emerald-600 dark:text-emerald-400'}>
            {isFocus ? 'Fokus' : 'Pause'}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label="Einstellungen"
          title="Zeiten einstellen"
        >
          ⚙️
        </button>
      </div>

      <div className="mb-1 text-center font-mono text-3xl font-bold tabular-nums">
        {fmt(remaining)}
      </div>

      {/* progress bar */}
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            isFocus ? 'bg-primary' : 'bg-emerald-500',
          )}
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>

      {/* round dots */}
      <div className="mb-2 flex items-center justify-center gap-1">
        {Array.from({ length: LONG_BREAK_EVERY }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              i < state.rounds % LONG_BREAK_EVERY || (state.rounds > 0 && state.rounds % LONG_BREAK_EVERY === 0 && !isFocus)
                ? 'bg-primary'
                : 'bg-border',
            )}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {state.running ? (
          <button
            type="button"
            onClick={pause}
            className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {remaining < total ? 'Weiter' : 'Start'}
          </button>
        )}
        <button
          type="button"
          onClick={reset}
          className="rounded-md border px-2 py-1.5 text-xs hover:bg-muted"
          title="Zurücksetzen"
          aria-label="Zurücksetzen"
        >
          ↺
        </button>
        <button
          type="button"
          onClick={skip}
          className="rounded-md border px-2 py-1.5 text-xs hover:bg-muted"
          title={isFocus ? 'Zur Pause springen' : 'Zum Fokus springen'}
          aria-label="Überspringen"
        >
          ⏭
        </button>
      </div>

      {settingsOpen && (
        <div className="mt-3 space-y-2 border-t pt-3 text-xs">
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Fokus (Min.)</span>
            <input
              type="number"
              min={1}
              max={90}
              value={state.focusMin}
              onChange={(e) =>
                updateConfig({ focusMin: clampMin(e.target.value, 25) })
              }
              className="w-14 rounded border bg-background px-1.5 py-1 text-right"
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Pause (Min.)</span>
            <input
              type="number"
              min={1}
              max={60}
              value={state.breakMin}
              onChange={(e) =>
                updateConfig({ breakMin: clampMin(e.target.value, 5) })
              }
              className="w-14 rounded border bg-background px-1.5 py-1 text-right"
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Lange Pause</span>
            <input
              type="number"
              min={1}
              max={60}
              value={state.longBreakMin}
              onChange={(e) =>
                updateConfig({ longBreakMin: clampMin(e.target.value, 15) })
              }
              className="w-14 rounded border bg-background px-1.5 py-1 text-right"
            />
          </label>
          <p className="text-[10px] text-muted-foreground">
            Nach {LONG_BREAK_EVERY} Fokus-Runden gibt es die lange Pause.
          </p>
        </div>
      )}
    </div>
  );
}

function clampMin(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(90, Math.max(1, n));
}
