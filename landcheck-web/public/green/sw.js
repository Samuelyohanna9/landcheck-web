self.CACHE_NAME = "green-shell-v5";
self.MAP_CACHE_NAME = "green-map-v1";
self.SYNC_TAG = "green-sync-queue";
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
        keys.filter((key) => {
          const isOldShell = key.startsWith("green-shell-") && key !== self.CACHE_NAME;
          const isOldMap = key.startsWith("green-map-") && key !== self.MAP_CACHE_NAME;
          return isOldShell || isOldMap;
        }).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== self.SYNC_TAG) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "GREEN_SYNC_QUEUE" });
        });
      })
      .catch(() => {})
  );
});

function isMapboxRequest(url) {
  const host = String(url.hostname || "").toLowerCase();
  if (!host.endsWith(".mapbox.com") && host !== "mapbox.com") return false;
  const path = String(url.pathname || "");
  return (
    path.includes("/styles/v1/") ||
    path.includes("/tiles/") ||
    path.includes("/fonts/v1/") ||
    path.includes("/sprites/") ||
    path.includes("/raster/v1/") ||
    path.includes("/v4/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (req.method !== "GET") {
    return;
  }

  if (isMapboxRequest(url)) {
    event.respondWith(
      caches.open(self.MAP_CACHE_NAME).then((mapCache) =>
        mapCache.match(req).then((cached) => {
          const networkFetch = fetch(req).then((resp) => {
            if (resp && resp.ok) {
              mapCache.put(req, resp.clone());
            }
            return resp;
          });

          if (cached) {
            event.waitUntil(networkFetch.catch(() => {}));
            return cached;
          }

          return networkFetch.catch(
            () =>
              cached ||
              new Response("Offline map resource unavailable", {
                status: 503,
                statusText: "Offline",
              })
          );
        })
      )
    );
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
