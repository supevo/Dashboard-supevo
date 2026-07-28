'use client';

import { useEffect, useRef } from 'react';
import { setPresenceAction } from '@/features/gamification/actions';

const IDLE_MS = 5 * 60_000; // 5 min without activity → away
const BEAT_MS = 90_000; // refresh "online" while actively working

/**
 * Renders nothing. Detects activity and keeps the current user's presence in
 * sync automatically: online while active, "abwesend" (afk) after 5 min idle or
 * when the tab is hidden/closed. A manually chosen "Nicht stören" (dnd) is never
 * overridden (enforced server-side in setPresenceAction).
 */
export function PresenceTracker() {
  const state = useRef<'online' | 'afk'>('online');

  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | null = null;

    const set = (s: 'online' | 'afk') => {
      if (state.current !== s) {
        state.current = s;
        void setPresenceAction(s);
      }
    };
    const armIdle = () => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => set('afk'), IDLE_MS);
    };
    const active = () => {
      if (document.visibilityState === 'visible') {
        set('online');
        armIdle();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') set('afk');
      else active();
    };

    active();
    const events = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'focus'];
    events.forEach((e) => window.addEventListener(e, active, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    // Keep "online" fresh during steady work (also re-asserts after a manual pick).
    const beat = setInterval(() => {
      if (document.visibilityState === 'visible' && state.current === 'online') {
        void setPresenceAction('online');
      }
    }, BEAT_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, active));
      document.removeEventListener('visibilitychange', onVisibility);
      if (idle) clearTimeout(idle);
      clearInterval(beat);
    };
  }, []);

  return null;
}
