/* Service Worker für PWA + Web-Push.
 * Bewusst schlank: kein Offline-Caching (vermeidet veraltete Inhalte), nur
 * Installations-/Aktivierungs-Handling und die Push-Benachrichtigungen. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Eingehende Push-Nachricht → Benachrichtigung anzeigen.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'supevo', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'supevo Dashboard';
  const options = {
    body: data.body || '',
    icon: '/supevo-logo-dark.svg',
    badge: '/supevo-logo-dark.svg',
    data: { url: data.url || '/app' },
    tag: data.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Klick auf die Benachrichtigung → passende Seite fokussieren/öffnen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
