'use client';

import { useEffect } from 'react';

/**
 * Registriert den Service-Worker (PWA + Push). Läuft nur im Browser, ist ein
 * No-op, wenn der Browser keine Service-Worker unterstützt. Rendert nichts.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* Registrierung fehlgeschlagen – App funktioniert weiterhin normal. */
      });
    };
    // Nach dem Laden registrieren, um den ersten Paint nicht zu verzögern.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
