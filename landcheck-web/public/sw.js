self.CACHE_NAME = "green-shell-v6";
self.MAP_CACHE_NAME = "green-map-v2";
self.SYNC_TAG = "green-sync-queue";

/* ── Precache list ─────────────────────────────────────────────── */
self.PRECACHE_URLS = [
  "/green",
  "/green/",
  "/green/manifest.webmanifest",
  "/green/icons/icon-192.png",
  "/green/icons/icon-512.png",
  "/green/icons/icon-512-maskable.png",
];

/* ── Install ───────────────────────────────────────────────────── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(self.CACHE_NAME).then((cache) =>
      Promise.allSettled(
        self.PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[SW] precache skip:", url, err.message);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

/* ── Activate ──────────────────────────────────────────────────── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => {
              const isOldShell =
                key.startsWith("green-shell-") && key !== self.CACHE_NAME;
              const isOldMap =
                key.startsWith("green-map-") && key !== self.MAP_CACHE_NAME;
              return isOldShell || isOldMap;
            })
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ── Background Sync ───────────────────────────────────────────── */
self.addEventListener("sync", (event) => {
  if (event.tag !== self.SYNC_TAG) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        if (clients.length === 0) {
          // No open client windows – nothing we can do from SW alone
          // The queue will be processed next time the app opens
          return;
        }
        clients.forEach((client) => {
          client.postMessage({ type: "GREEN_SYNC_QUEUE" });
        });
      })
      .catch(() => {})
  );
});

/* ── Helpers ───────────────────────────────────────────────────── */
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

function isGreenRoute(pathname) {
  return (
    pathname === "/green" ||
    pathname === "/green-work" ||
    pathname.startsWith("/green/") ||
    pathname.startsWith("/green-work/")
  );
}

function isGreenAsset(pathname) {
  return (
    pathname.startsWith("/green/") ||
    pathname === "/green" ||
    pathname === "/green-logo-cropped-760.png" ||
    pathname === "/green%20logo.png" ||
    pathname === "/green-work" ||
    pathname.startsWith("/green-work/")
  );
}

/* ── Fetch handler ─────────────────────────────────────────────── */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Only handle GET requests
  if (req.method !== "GET") return;

  // Skip API calls – let them go straight to network
  if (isSameOrigin && url.pathname.startsWith("/api/")) return;
  if (isSameOrigin && url.pathname.startsWith("/green/") && url.pathname.includes("/api/")) return;

  /* ── Mapbox tile / style / font caching (stale-while-revalidate) ── */
  if (isMapboxRequest(url)) {
    event.respondWith(
      caches.open(self.MAP_CACHE_NAME).then((mapCache) =>
        mapCache.match(req).then((cached) => {
          const networkFetch = fetch(req)
            .then((resp) => {
              if (resp && resp.ok) {
                mapCache.put(req, resp.clone());
              }
              return resp;
            })
            .catch((err) => {
              // Network failed – return cached version if we have one
              if (cached) return cached;
              return new Response("Offline map resource unavailable", {
                status: 503,
                statusText: "Offline",
              });
            });

          // If we have a cache hit, serve it immediately and revalidate in background
          if (cached) {
            event.waitUntil(networkFetch.catch(() => {}));
            return cached;
          }

          // No cache hit – wait for network
          return networkFetch;
        })
      )
    );
    return;
  }

  /* ── SPA navigation (network-first → cache → /green fallback) ── */
  const isAppNavigation =
    req.mode === "navigate" && isSameOrigin && isGreenRoute(url.pathname);

  if (isAppNavigation) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches
              .open(self.CACHE_NAME)
              .then((cache) => cache.put(req, copy));
          }
          return resp;
        })
        .catch(() =>
          caches
            .match(req)
            .then((resp) => resp || caches.match("/green"))
            .then(
              (resp) =>
                resp ||
                new Response("Offline – please reconnect", {
                  status: 503,
                  headers: { "Content-Type": "text/html" },
                })
            )
        )
    );
    return;
  }

  /* ── Non-same-origin: pass through ── */
  if (!isSameOrigin) return;

  /* ── Static assets (cache-first) ── */
  const isBuildAsset = url.pathname.startsWith("/assets/");
  const isCacheableStatic = isGreenAsset(url.pathname) || isBuildAsset;
  if (!isCacheableStatic) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches
            .open(self.CACHE_NAME)
            .then((cache) => cache.put(req, copy));
        }
        return resp;
      });
    })
  );
});
