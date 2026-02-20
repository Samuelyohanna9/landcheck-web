var CACHE_NAME = "green-shell-v8";
var MAP_CACHE_NAME = "green-map-v3";
var SYNC_TAG = "green-sync-queue";

/* ── Precache list ─────────────────────────────────────────────── */
var PRECACHE_URLS = [
  "/green",
  "/green/manifest.webmanifest",
  "/green/icons/icon-192.png",
  "/green/icons/icon-512.png",
  "/green/icons/icon-512-maskable.png",
];

/* ── Install ───────────────────────────────────────────────────── */
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.allSettled(
        PRECACHE_URLS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn("[SW] precache skip:", url, err.message);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

/* ── Activate ──────────────────────────────────────────────────── */
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              var isOldShell =
                key.startsWith("green-shell-") && key !== CACHE_NAME;
              var isOldMap =
                key.startsWith("green-map-") && key !== MAP_CACHE_NAME;
              return isOldShell || isOldMap;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

/* ── Background Sync ───────────────────────────────────────────── */
self.addEventListener("sync", function (event) {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clients) {
        if (clients.length === 0) return;
        clients.forEach(function (client) {
          client.postMessage({ type: "GREEN_SYNC_QUEUE" });
        });
      })
      .catch(function () {})
  );
});

/* ── Message handler for tile pre-caching ──────────────────────── */
self.addEventListener("message", function (event) {
  var data = event.data || {};

  /* Pre-cache map tiles for a bounding box */
  if (data.type === "PRECACHE_MAP_TILES") {
    var urls = data.urls || [];
    if (urls.length === 0) return;
    event.waitUntil(
      caches.open(MAP_CACHE_NAME).then(function (cache) {
        var done = 0;
        var total = urls.length;
        var batchSize = 6; // Limit concurrent fetches

        function fetchBatch(startIndex) {
          var batch = urls.slice(startIndex, startIndex + batchSize);
          if (batch.length === 0) {
            // Notify client we're done
            if (event.source) {
              event.source.postMessage({
                type: "PRECACHE_MAP_TILES_DONE",
                cached: done,
                total: total,
              });
            }
            return Promise.resolve();
          }

          return Promise.allSettled(
            batch.map(function (url) {
              return cache.match(url).then(function (existing) {
                if (existing) {
                  done++;
                  return; // Already cached
                }
                return fetch(url)
                  .then(function (resp) {
                    if (resp && resp.ok) {
                      done++;
                      return cache.put(url, resp);
                    }
                  })
                  .catch(function () {
                    // Skip failed tiles silently
                  });
              });
            })
          ).then(function () {
            // Report progress
            if (event.source) {
              event.source.postMessage({
                type: "PRECACHE_MAP_TILES_PROGRESS",
                cached: done,
                total: total,
              });
            }
            return fetchBatch(startIndex + batchSize);
          });
        }

        return fetchBatch(0);
      })
    );
    return;
  }

  /* Pre-cache Vite build assets (JS/CSS bundles) */
  if (data.type === "PRECACHE_BUILD_ASSETS") {
    var assetUrls = data.urls || [];
    if (assetUrls.length === 0) return;
    event.waitUntil(
      caches.open(CACHE_NAME).then(function (cache) {
        return Promise.allSettled(
          assetUrls.map(function (url) {
            return cache.match(url).then(function (existing) {
              if (existing) return;
              return fetch(url)
                .then(function (resp) {
                  if (resp && resp.ok) {
                    return cache.put(url, resp);
                  }
                })
                .catch(function () {});
            });
          })
        );
      })
    );
    return;
  }
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
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache
      .match("/green")
      .then(function (resp) {
        if (resp) return resp;
        return cache.match("/green/");
      })
      .then(function (resp) {
        if (resp) return resp;
        return cache.match("/");
      })
      .then(function (resp) {
        if (resp) return resp;
        // Last resort: look for any cached HTML response
        return cache.match(new Request(self.registration.scope));
      });
  });
}

/* ── Fetch handler ─────────────────────────────────────────────── */
self.addEventListener("fetch", function (event) {
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
      caches.open(MAP_CACHE_NAME).then(function (mapCache) {
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
              // Return transparent 1x1 PNG for missing raster tiles instead of error
              if (
                url.pathname.includes("/tiles/") ||
                url.pathname.includes("/v4/")
              ) {
                return new Response(
                  Uint8Array.from(
                    atob(
                      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTkSuQmCC"
                    ),
                    function (c) {
                      return c.charCodeAt(0);
                    }
                  ),
                  {
                    status: 200,
                    headers: {
                      "Content-Type": "image/png",
                      "Cache-Control": "no-store",
                    },
                  }
                );
              }
              return new Response("Offline map resource unavailable", {
                status: 503,
                statusText: "Offline",
              });
            });

          if (cached) {
            // Serve cached tile immediately; update in background
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
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(req, copy);
              // Also store under /green key so offline fallback always works
              if (
                url.pathname === "/green" ||
                url.pathname === "/green/" ||
                url.pathname === "/"
              ) {
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
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return resp;
      });
    })
  );
});
