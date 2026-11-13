// Pulled into the generated service worker (workbox importScripts): shows the reminders
// sent by the Worker and brings the app to the front when one is tapped.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    /* an empty or unreadable payload still gets the generic notification */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '書影紀錄', {
      body: data.body || '',
      icon: 'apple-touch-icon.png',
      badge: 'apple-touch-icon.png',
      tag: data.url || 'reminder',
      data: { url: data.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope))
      if (!open) return self.clients.openWindow(target)
      open.navigate?.(target).catch?.(() => {})
      return open.focus()
    }),
  )
})
