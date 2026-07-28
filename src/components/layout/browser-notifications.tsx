'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { bumpCounter } from '@/features/gamification/actions';

const STORAGE_KEY = 'browserNotifyEnabled';
const POLL_MS = 30_000;

interface RecentNotification {
  id: string;
  title: string;
  body: string | null;
}

/** Plays a short two-tone chime using the Web Audio API (no asset needed). */
function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const tones = [
      { f: 880, t: 0 },
      { f: 1174, t: 0.14 },
    ];
    for (const { f, t } of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.24);
    }
    setTimeout(() => ctx.close(), 800);
  } catch {
    // Audio not available — silent.
  }
}

/**
 * Header control that enables desktop notifications with a sound while the
 * dashboard is open. Polls for new unread notifications and shows a native
 * Notification + chime for each one not seen before.
 */
export function BrowserNotifications() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setSupported(true);
    setEnabled(
      localStorage.getItem(STORAGE_KEY) === 'true' &&
        Notification.permission === 'granted',
    );
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/recent', {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = (await res.json()) as { notifications: RecentNotification[] };
      const list = json.notifications ?? [];

      // First run just records the current state so old items don't fire.
      if (!seededRef.current) {
        for (const n of list) seenRef.current.add(n.id);
        seededRef.current = true;
        return;
      }

      const fresh = list.filter((n) => !seenRef.current.has(n.id));
      for (const n of fresh) {
        seenRef.current.add(n.id);
        try {
          new Notification(n.title, {
            body: n.body ?? undefined,
            tag: n.id,
          });
        } catch {
          // Notification construction can throw on some platforms — ignore.
        }
      }
      if (fresh.length > 0) playChime();
    } catch {
      // Network hiccup — try again next tick.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, poll]);

  async function toggle() {
    if (enabled) {
      setEnabled(false);
      localStorage.setItem(STORAGE_KEY, 'false');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission === 'granted') {
      seededRef.current = false; // re-seed on enable
      setEnabled(true);
      localStorage.setItem(STORAGE_KEY, 'true');
      playChime(); // confirmation + unlocks audio via the click gesture
      void bumpCounter('notifications'); // collectible badge "Glöckner"
    }
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={
        enabled
          ? 'Browser-Benachrichtigungen aktiv – zum Deaktivieren klicken'
          : 'Browser-Benachrichtigungen aktivieren'
      }
      aria-pressed={enabled}
      className="rounded-md px-2 py-1 text-lg hover:bg-muted"
    >
      {enabled ? '🔔' : '🔕'}
    </button>
  );
}
