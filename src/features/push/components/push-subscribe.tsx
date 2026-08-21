'use client';

import { useEffect, useState } from 'react';
import {
  savePushSubscriptionAction,
  deletePushSubscriptionAction,
} from '@/features/push/actions';
import { Button } from '@/components/ui/button';

/** base64url (VAPID public key) → Uint8Array für die PushManager-API. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = 'loading' | 'unsupported' | 'off' | 'on' | 'denied' | 'nokey';

/**
 * Aktiviert/deaktiviert Push-Benachrichtigungen aufs Gerät. Fordert die
 * Browser-Erlaubnis an, abonniert beim PushManager mit dem VAPID-Public-Key und
 * speichert das Abo serverseitig.
 */
export function PushSubscribe() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      setState('unsupported');
      return;
    }
    if (!vapid) {
      setState('nokey');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, [vapid]);

  async function enable() {
    if (!vapid) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: DOM-Typen erwarten BufferSource; die Uint8Array-Generics des
        // aktuellen lib.dom sind hier zu streng.
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await savePushSubscriptionAction({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent,
      });
      setState(res.ok ? 'on' : 'off');
    } catch {
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
    } catch {
      /* ignorieren */
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return null;

  if (state === 'unsupported') {
    return (
      <p className="text-sm text-muted-foreground">
        Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.
      </p>
    );
  }
  if (state === 'nokey') {
    return (
      <p className="text-sm text-muted-foreground">
        Push ist serverseitig noch nicht konfiguriert (VAPID-Schlüssel fehlen).
      </p>
    );
  }
  if (state === 'denied') {
    return (
      <p className="text-sm text-muted-foreground">
        Benachrichtigungen sind im Browser blockiert. Bitte in den
        Website-Einstellungen erlauben.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {state === 'on' ? (
        <>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            🔔 Push aktiv
          </span>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={disable}>
            Deaktivieren
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" disabled={busy} onClick={enable}>
          {busy ? 'Aktiviere …' : '🔔 Push aktivieren'}
        </Button>
      )}
    </div>
  );
}
