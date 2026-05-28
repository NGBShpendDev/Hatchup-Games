// HatchUp web push service worker.
// Receives push events from the browser's push service and renders a
// notification, plus handles clicks to focus or open the app at the right
// page.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "HatchUp", body: "", link: "/", tag: undefined };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch (_err) {
    payload.body = event.data ? event.data.text() : "";
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: payload.tag,
      data: { link: payload.link || "/" },
      renotify: Boolean(payload.tag),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            try { client.navigate(link); } catch (_err) { /* ignore */ }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(link);
      }
    }),
  );
});
