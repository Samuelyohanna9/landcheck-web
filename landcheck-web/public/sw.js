self.CACHE_NAME = "green-shell-v7";
self.MAP_CACHE_NAME = "green-map-v2";
self.SYNC_TAG = "green-sync-queue";

/* ── Precache list ─────────────────────────────────────────────── */
self.PRECACHE_URLS = [
  "/green",
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
        if (clients.length === 0) return;
        clients.forEach((client) => {
          client.postMessage({ type: "GREEN_SYNC_QUEUE" });
        });
      })
      .catch(() => {})
  );
});

/* ── Helpers ───────────────────────────────────────────────────── */
function isMapboxRequest(url) {
  var host = String(url.hostname || "").toLowerCase();
  if (!host.endsWith(".mapbox.com") && host !== "mapbox.com") return false;
  var path = String(url.pathname || "");
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
    pathname === "/" ||
    pathname === "/green" ||
    pathname === "/green/" ||
    pathname === "/green-work" ||
    pathname === "/green-work/" ||
    pathname.startsWith("/green/") ||
    pathname.startsWith("/green-work/")
  );
}

function isGreenAsset(pathname) {
  return (
    pathname.startsWith("/green/") ||
    pathname.startsWith("/green-work/") ||
    pathname === "/green" ||
    pathname === "/green-work" ||
    pathname === "/green-logo-cropped-760.png" ||
    pathname === "/green-logo-cropped-700.png" ||
    pathname === "/green%20logo.png"
  );
}

/**
 * Try to find the SPA shell HTML in the cache.
 * iOS Safari may cache it under different keys depending on how the page was first loaded,
 * so we try multiple variants.
 */
function findCachedShell() {
  return caches.open(self.CACHE_NAME).then(function (cache) {
    return cache.match("/green").then(function (resp) {
      if (resp) return resp;
      return cache.match("/green/");
    }).then(function (resp) {
      if (resp) return resp;
      return cache.match("/");
    }).then(function (resp) {
      if (resp) return resp;
      // Last resort: look for any cached HTML response
      return cache.match(new Request(self.registration.scope));
    });
  });
}

/* ── Fetch handler ─────────────────────────────────────────────── */
self.addEventListener("fetch", (event) => {
  var req = event.request;
  var url = new URL(req.url);
  var isSameOrigin = url.origin === self.location.origin;

  // Only handle GET requests
  if (req.method !== "GET") return;

  // Skip API calls – let them go straight to network
  if (isSameOrigin && url.pathname.startsWith("/api/")) return;

  /* ── Mapbox tile / style / font caching (stale-while-revalidate) ── */
  if (isMapboxRequest(url)) {
    event.respondWith(
      caches.open(self.MAP_CACHE_NAME).then(function (mapCache) {
        return mapCache.match(req).then(function (cached) {
          var networkFetch = fetch(req)
            .then(function (resp) {
              if (resp && resp.ok) {
                mapCache.put(req, resp.clone());
              }
              return resp;
            })
            .catch(function () {
              if (cached) return cached;
              return new Response("Offline map resource unavailable", {
                status: 503,
                statusText: "Offline",
              });
            });

          if (cached) {
            event.waitUntil(networkFetch.catch(function () {}));
            return cached;
          }

          return networkFetch;
        });
      })
    );
    return;
  }

  /* ── SPA navigation (network-first → cache → shell fallback) ────── */
  var isAppNavigation = req.mode === "navigate" && isSameOrigin;

  if (isAppNavigation) {
    event.respondWith(
      fetch(req)
        .then(function (resp) {
          if (resp.ok) {
            var copy = resp.clone();
            caches.open(self.CACHE_NAME).then(function (cache) {
              cache.put(req, copy);
              // Also store under /green key so offline fallback always works
              if (url.pathname === "/green" || url.pathname === "/green/" || url.pathname === "/") {
                cache.put("/green", resp.clone());
              }
            });
          }
          return resp;
        })
        .catch(function () {
          // Offline: try to serve from cache
          return caches
            .match(req)
            .then(function (resp) {
              if (resp) return resp;
              // SPA: any navigation can be served by the shell HTML
              return findCachedShell();
            })
            .then(function (resp) {
              return (
                resp ||
                new Response(
                  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LandCheck Green - Offline</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0b1f16;color:#efffec;text-align:center}h1{font-size:1.4rem}p{color:#a0c9a8;margin-top:0.5rem}</style></head><body><div><h1>You are offline</h1><p>Please reconnect to the internet and reload.</p></div></body></html>',
                  {
                    status: 200,
                    headers: { "Content-Type": "text/html; charset=utf-8" },
                  }
                )
              );
            });
        })
    );
    return;
  }

  /* ── Non-same-origin: pass through ── */
  if (!isSameOrigin) return;

  /* ── Static assets (cache-first) ── */
  var isBuildAsset = url.pathname.startsWith("/assets/");
  var isCacheableStatic = isGreenAsset(url.pathname) || isBuildAsset;
  if (!isCacheableStatic) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (resp) {
        if (resp.ok) {
          var copy = resp.clone();
          caches.open(self.CACHE_NAME).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return resp;
      });
    })
  );
});
