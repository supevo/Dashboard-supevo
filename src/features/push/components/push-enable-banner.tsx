'use client';

import { useEffect, useState } from 'react';
import { savePushSubscriptionAction } from '@/features/push/actions';
import { Button } from '@/components/ui/button';

/** base64url (VAPID-Public-Key) → Uint8Array für die PushManager-API. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const DISMISS_KEY = 'pushBannerDismissed';

/**
 * Einmaliger Hinweis oben auf dem Dashboard, der Push-Benachrichtigungen mit
 * einem Klick aktiviert – erscheint nur, solange dieser Browser noch KEIN Abo
 * hat, VAPID konfiguriert ist und die Erlaubnis nicht blockiert wurde. „Später"
 * blendet ihn für die Sitzung aus (kommt beim nächsten Login wieder).
 */
export function PushEnableBanner() {
  const [state, setState] = useState<'hidden' | 'show' | 'busy'>('hidden');

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      return;
    }
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    // Blockiert → wir könnten ohnehin nicht fragen; kein Banner (der Nutzer muss
    // es in den Browser-Einstellungen erlauben).
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return;

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) setState('show');
      })
      .catch(() => {});
  }, []);

  if (state === 'hidden') return null;

  async function enable() {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) return;
    setState('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        // Abgelehnt/verworfen → Banner für die Sitzung ausblenden.
        try {
          sessionStorage.setItem(DISMISS_KEY, '1');
        } catch {
          /* ignore */
        }
        setState('hidden');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
      const json = sub.toJSON();
      await savePushSubscriptionAction({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent,
      });
      setState('hidden');
    } catch {
      setState('show');
    }
  }

  function later() {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setState('hidden');
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
      <div className="flex items-start gap-2 text-sm">
        <span className="text-lg leading-none">🔔</span>
        <span>
          <span className="font-medium">Benachrichtigungen aktivieren</span> – so
          wirst du bei neuen Chatnachrichten sofort informiert, auch wenn der Tab
          im Hintergrund ist.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" size="sm" onClick={enable} disabled={state === 'busy'}>
          {state === 'busy' ? 'Aktiviere …' : 'Aktivieren'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={later} disabled={state === 'busy'}>
          Später
        </Button>
      </div>
    </div>
  );
}
