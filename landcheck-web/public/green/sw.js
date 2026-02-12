self.CACHE_NAME = "green-shell-v4";
self.PRECACHE_URLS = [
  "/green",
  "/green/",
  "/green/manifest.webmanifest",
  "/green/icons/icon-192.png",
  "/green/icons/icon-512.png",
  "/green/icons/icon-512-maskable.png",
  "/green-logo-cropped-760.png",
  "/green%20logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(self.CACHE_NAME).then((cache) => cache.addAll(self.PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("green-shell-") && key !== self.CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (req.method !== "GET") {
    return;
  }

  const isGreenNavigation = req.mode === "navigate" && isSameOrigin && url.pathname.startsWith("/green");
  if (isGreenNavigation) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(self.CACHE_NAME).then((cache) => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req).then((resp) => resp || caches.match("/green")))
    );
    return;
  }

  if (!isSameOrigin) {
    return;
  }

  const isGreenPath =
    url.pathname.startsWith("/green/") ||
    url.pathname === "/green" ||
    url.pathname === "/green-logo-cropped-760.png" ||
    url.pathname === "/green%20logo.png";
  const isBuildAsset = url.pathname.startsWith("/assets/");
  const isCacheableStatic = isGreenPath || isBuildAsset;

  if (!isCacheableStatic) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(self.CACHE_NAME).then((cache) => cache.put(req, copy));
        return resp;
      });
    })
  );
});
