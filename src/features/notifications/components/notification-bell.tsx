'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/features/notifications/actions';
import { idleResult } from '@/lib/action-result';
import { bumpCounter } from '@/features/gamification/actions';
import { de } from '@/lib/i18n/de';

const POLL_MS = 30_000;
const SOUND_KEY = 'browserNotifyEnabled';

interface FeedItem {
  id: string;
  type: keyof typeof de.notificationType;
  title: string;
  body: string | null;
  entityType: string;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

/** Short two-tone chime via Web Audio – no asset needed. */
function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    for (const { f, t } of [
      { f: 880, t: 0 },
      { f: 1174, t: 0.14 },
    ]) {
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
    // Audio unavailable – silent.
  }
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

/**
 * Header notification bell: shows an unread badge and, on click, a dropdown with
 * the most recent notifications (deep-linked, click marks read). Also hosts the
 * opt-in for desktop pop-ups + sound while the dashboard is open.
 */
export function NotificationBell({ area }: { area: 'app' | 'portal' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [soundSupported, setSoundSupported] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  const notificationsHref = `/${area}/notifications`;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/feed', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as { unreadCount: number; notifications: FeedItem[] };
      const list = json.notifications ?? [];
      setItems(list);
      setUnread(json.unreadCount ?? 0);

      // Desktop pop-up + chime for newly arrived unread items (opt-in).
      const unreadItems = list.filter((n) => !n.isRead);
      if (!seededRef.current) {
        for (const n of unreadItems) seenRef.current.add(n.id);
        seededRef.current = true;
        return;
      }
      const fresh = unreadItems.filter((n) => !seenRef.current.has(n.id));
      for (const n of fresh) seenRef.current.add(n.id);
      if (soundOn && fresh.length > 0) {
        for (const n of fresh) {
          try {
            new Notification(n.title, { body: n.body ?? undefined, tag: n.id });
          } catch {
            // Notification may throw on some platforms – ignore.
          }
        }
        playChime();
      }
    } catch {
      // Network hiccup – retry next tick.
    }
  }, [soundOn]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setSoundSupported(true);
      setSoundOn(
        localStorage.getItem(SOUND_KEY) === 'true' && Notification.permission === 'granted',
      );
    }
    void load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function hrefFor(n: FeedItem): string {
    if (n.entityType === 'task' && n.entityId) return `/${area}/tasks/${n.entityId}`;
    // Chat notifications: agency staff jump straight to the conversation; the
    // client opens the portal (where their floating chat dock lives).
    if (n.entityType === 'chat' && n.entityId) {
      return area === 'app' ? `/app/chat/${n.entityId}` : '/portal';
    }
    return notificationsHref;
  }

  async function openItem(n: FeedItem) {
    setOpen(false);
    if (!n.isRead) {
      const fd = new FormData();
      fd.set('notificationId', n.id);
      try {
        await markNotificationReadAction(idleResult, fd);
      } catch {
        // best effort
      }
      setUnread((c) => Math.max(0, c - 1));
    }
    router.push(hrefFor(n));
  }

  async function markAll() {
    await markAllNotificationsReadAction();
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    router.refresh();
  }

  async function toggleSound() {
    if (soundOn) {
      setSoundOn(false);
      localStorage.setItem(SOUND_KEY, 'false');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission === 'granted') {
      seededRef.current = false; // re-seed so old items don't fire
      setSoundOn(true);
      localStorage.setItem(SOUND_KEY, 'true');
      playChime();
      void bumpCounter('notifications'); // collectible badge "Glöckner"
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={de.notifications.title}
        aria-label={de.notifications.title}
        aria-expanded={open}
        className="relative rounded-md px-2 py-1 text-lg hover:bg-muted"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border bg-card shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className="text-sm font-semibold">{de.notifications.title}</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-xs text-primary hover:underline"
              >
                {de.notifications.markAllRead}
              </button>
            )}
          </div>

          <ul className="max-h-80 divide-y overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {de.notifications.none}
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void openItem(n)}
                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-muted ${
                      n.isRead ? 'opacity-60' : ''
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.isRead ? 'bg-transparent' : 'bg-primary'
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{n.title}</span>
                      {n.body && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {de.notificationType[n.type]} · {relTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
            <Link
              href={notificationsHref}
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {de.notifications.viewAll}
            </Link>
            {soundSupported && (
              <button
                type="button"
                onClick={() => void toggleSound()}
                aria-pressed={soundOn}
                title={soundOn ? de.notifications.desktopOn : de.notifications.desktopEnable}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {soundOn ? '🔔' : '🔕'} {de.notifications.desktopEnable}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
