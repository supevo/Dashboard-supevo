'use client';

import { useActionState, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { stopTimerAction } from '@/features/time-tracking/timer-actions';
import { idleResult } from '@/lib/action-result';
import { de } from '@/lib/i18n/de';

interface Timer {
  id: string;
  taskId: string | null;
  projectId: string;
  startedAt: string;
  label: string;
}

function elapsed(startedAt: string, now: number): string {
  const secs = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Header widget: shows the running timer, ticks live, stops from anywhere. */
export function RunningTimer() {
  const [timer, setTimer] = useState<Timer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [state, stop] = useActionState(async () => stopTimerAction(), idleResult);
  const pathname = usePathname();
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/timer', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { timer: Timer | null };
      setTimer(data.timer);
    } catch {
      /* transient */
    }
  }, []);

  // Refresh on mount, on navigation, and periodically (catch starts elsewhere).
  useEffect(() => {
    void load();
  }, [load, pathname]);
  useEffect(() => {
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  // Tick the displayed elapsed time every second while a timer runs.
  useEffect(() => {
    if (!timer) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timer]);

  // After stopping, clear and refresh server components.
  useEffect(() => {
    if (state.status === 'success') {
      setTimer(null);
      router.refresh();
    }
  }, [state, router]);

  if (!timer) return null;

  const href = timer.taskId
    ? `/app/projects/${timer.projectId}/tasks/${timer.taskId}`
    : `/app/projects/${timer.projectId}`;

  return (
    <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-2 py-1 dark:border-red-900 dark:bg-red-950/40">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
      <Link
        href={href}
        className="hidden max-w-[8rem] truncate text-xs text-red-800 hover:underline dark:text-red-200 sm:block"
        title={timer.label}
      >
        {timer.label}
      </Link>
      <span className="font-mono text-xs tabular-nums text-red-800 dark:text-red-200">
        {elapsed(timer.startedAt, now)}
      </span>
      <form action={stop}>
        <button
          type="submit"
          className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700"
          title={de.time.stopTimer}
        >
          ■
        </button>
      </form>
    </div>
  );
}
