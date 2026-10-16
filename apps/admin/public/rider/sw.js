/* Push only: no API responses or private delivery data are cached. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { /* Show a generic visible alert. */ }
  const url = payload.url === "/rider/collections" ? payload.url : "/rider/notifications";
  event.waitUntil(Promise.all([
    self.registration.showNotification("iGO Delivery", {
      body: url === "/rider/collections" ? "New packages assigned. Open iGO to see your collection stops." : "You have an update in your rider workspace.",
      tag: /^igo-[a-f0-9-]{36}$/.test(payload.tag ?? "") ? payload.tag : "igo-rider-update",
      data: { url },
      renotify: false,
    }),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) if (new URL(client.url).pathname.startsWith("/rider")) client.postMessage({ type: "IGO_RIDER_UPDATE" });
    }),
  ]));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url === "/rider/collections" ? "/rider/collections" : "/rider/notifications";
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => new URL(client.url).pathname.startsWith("/rider"));
    if (existing) { await existing.navigate(path); return existing.focus(); }
    return self.clients.openWindow(path);
  })());
});
