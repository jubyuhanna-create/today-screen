// Shows the notifications the server sends, and opens the app when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data && event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Today', {
      body: d.body || '',
      icon: '/apple-icon.png',
      badge: '/badge.png',
      tag: d.tag,
      renotify: !!d.tag,
      dir: 'auto',
      data: { url: d.url || '/phone' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/phone';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.includes(url) && 'focus' in c) return c.focus();
      return self.clients.openWindow(url);
    })
  );
});
