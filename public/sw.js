// public/sw.js
// ChillarFlow Service Worker — handles Web Push notifications and offline caching.
//
// Registered in app/layout.tsx or app/(authenticated)/app/page.tsx.
// Push payload shape:
//   {
//     title:   string,
//     body:    string,
//     tag:     string,          // deduplication key
//     url:     string,          // relative URL to open on click
//     icon?:   string,          // optional icon path
//   }

const CACHE_NAME = 'cf-shell-v1';

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => clients.claim())
  );
});

// ─── Push handler ─────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'ChillarFlow', body: event.data.text(), tag: 'cf-default', url: '/app' };
  }

  const { title = 'ChillarFlow', body = '', tag = 'cf-default', url = '/app', icon } = data;

  const options = {
    body,
    tag,
    icon: icon || '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url },
    // Vibrate: short-long-short
    vibrate: [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/app';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If the app is already open, focus it and navigate
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new window
      return clients.openWindow(targetUrl);
    })
  );
});

// ─── Fetch: network-first, offline fallback ───────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only intercept same-origin page navigations for offline fallback
  if (
    event.request.mode === 'navigate' &&
    event.request.url.startsWith(self.location.origin)
  ) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/app') || caches.match('/')
      )
    );
  }
});
