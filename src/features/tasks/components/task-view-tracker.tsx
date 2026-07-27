'use client';

import { useEffect, useRef } from 'react';

/**
 * Records that the current agency user opened this task and how long they stay.
 * Counts only foreground time (pauses when the tab is hidden) and flushes the
 * dwell time on tab-hide and unmount. Invisible; renders nothing.
 */
export function TaskViewTracker({ taskId }: { taskId: string }) {
  const viewId = useRef<string | null>(null);
  const accumulated = useRef(0); // seconds counted so far
  const activeSince = useRef<number | null>(null); // ms timestamp or null when paused

  useEffect(() => {
    let cancelled = false;
    activeSince.current = Date.now();

    // Open the view record.
    void fetch(`/api/tasks/${taskId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open' }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { viewId?: string } | null) => {
        if (!cancelled && d?.viewId) viewId.current = d.viewId;
      })
      .catch(() => {});

    const currentDwell = () => {
      const live =
        activeSince.current !== null
          ? (Date.now() - activeSince.current) / 1000
          : 0;
      return Math.round(accumulated.current + live);
    };

    const flush = (useBeacon: boolean) => {
      if (!viewId.current) return;
      const payload = JSON.stringify({
        action: 'update',
        viewId: viewId.current,
        dwell: currentDwell(),
      });
      const url = `/api/tasks/${taskId}/view`;
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      } else {
        void fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (activeSince.current !== null) {
          accumulated.current += (Date.now() - activeSince.current) / 1000;
          activeSince.current = null;
        }
        flush(true);
      } else if (activeSince.current === null) {
        activeSince.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', () => flush(true));

    return () => {
      cancelled = true;
      if (activeSince.current !== null) {
        accumulated.current += (Date.now() - activeSince.current) / 1000;
        activeSince.current = null;
      }
      document.removeEventListener('visibilitychange', onVisibility);
      flush(true);
    };
  }, [taskId]);

  return null;
}
