self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("green-shell-v1").then((cache) =>
      cache.addAll([
        "/green",
        "/green/",
        "/green/manifest.webmanifest",
        "/green/icons/icon-192.svg",
        "/green/icons/icon-512.svg",
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin requests within /green
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/green")) {
    return;
  }

  // Network-first for navigation to keep content fresh, fallback to cache for offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open("green-shell-v1").then((cache) => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req).then((resp) => resp || caches.match("/green")))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open("green-shell-v1").then((cache) => cache.put(req, copy));
        return resp;
      });
    })
  );
});
