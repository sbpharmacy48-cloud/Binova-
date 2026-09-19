self.addEventListener('push', (event) => {
  const payload = (() => {
    try { return event.data?.json() || {} } catch { return { title: 'BINOVA', body: event.data?.text() || '' } }
  })()
  const title = payload.title || 'BINOVA'
  const options = {
    body: payload.body || payload.message || '',
    icon: '/binova-mark.svg',
    badge: '/binova-mark.svg',
    data: { type: payload.type, url: payload.url || payload.action_url || '/notifications' },
    tag: payload.tag || 'binova-notification',
    renotify: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const fallbackRoutes = { deposit: '/deposit', withdrawal: '/withdraw', referral: '/referral', investment: '/investment', admin: '/notifications', system: '/notifications', security: '/notifications' }
  const target = new URL(data.url || fallbackRoutes[data.type] || '/notifications', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin))
    if (existing) { existing.navigate(target); return existing.focus() }
    return self.clients.openWindow(target)
  }))
})

self.addEventListener('notificationclose', () => {})
