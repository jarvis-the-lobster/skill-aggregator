// LearnStack Push Notification Service Worker

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'LearnStack';
  const options = {
    body: data.body || '',
    icon: data.icon || '/vite.svg',
    badge: '/vite.svg',
    data: { url: data.url || '/my-courses' },
    vibrate: [200, 100, 200],
    sound: '/notification.mp3',
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/my-courses';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
