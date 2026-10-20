/* Push only. Private pages and API responses are never cached. */
const base = self.IGO_WORKSPACE === "ADMIN" ? "/delivery" : self.IGO_WORKSPACE === "PARTNER" ? "/partner" : "/rider";
// Ignore older per-record destinations too: a phone alert opens only this inbox.
function safePath() { return `${base}/notifications`; }
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", e => {
  let payload = {}; try { payload = e.data?.json() ?? {}; } catch { /* Generic alert. */ }
  const url = safePath(payload.url);
  e.waitUntil(Promise.all([
    self.registration.showNotification("iGO Delivery", {
      body: "You have an update in your iGO workspace.",
      tag: /^igo-[a-f0-9-]{36}$/.test(payload.tag ?? "") ? payload.tag : "igo-update",
      data: { url }, renotify: false,
    }),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      for (const client of clients) if (new URL(client.url).pathname.startsWith(`${base}/`)) client.postMessage({ type: `IGO_${self.IGO_WORKSPACE === "DRIVER" ? "RIDER" : self.IGO_WORKSPACE}_UPDATE` });
    }),
  ]));
});
self.addEventListener("notificationclick", e => {
  e.notification.close(); const path = safePath(e.notification.data?.url);
  e.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find(c => new URL(c.url).origin === self.location.origin && new URL(c.url).pathname.startsWith(`${base}/`));
    if (existing) { await existing.navigate(path); return existing.focus(); }
    return self.clients.openWindow(path);
  })());
});
