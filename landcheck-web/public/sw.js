var CACHE_NAME = "green-shell-v10";
var MAP_CACHE_NAME = "green-map-v6";
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

  if (data.type === "PRECACHE_PMTILES_ARCHIVE") {
    var pmtilesUrl = String(data.url || "");
    if (!pmtilesUrl) return;
    event.waitUntil(
      caches.open(MAP_CACHE_NAME).then(function (cache) {
        return cache.match(pmtilesUrl).then(function (existing) {
          if (existing) {
            if (event.source) {
              event.source.postMessage({
                type: "PRECACHE_PMTILES_DONE",
                url: pmtilesUrl,
                cached: true,
              });
            }
            return;
          }
          return fetch(pmtilesUrl, { cache: "reload" })
            .then(function (resp) {
              if (resp && resp.ok) {
                return cache.put(pmtilesUrl, resp.clone()).then(function () {
                  if (event.source) {
                    event.source.postMessage({
                      type: "PRECACHE_PMTILES_DONE",
                      url: pmtilesUrl,
                      cached: true,
                    });
                  }
                });
              }
              throw new Error("Failed to cache PMTiles archive");
            })
            .catch(function () {
              if (event.source) {
                event.source.postMessage({
                  type: "PRECACHE_PMTILES_DONE",
                  url: pmtilesUrl,
                  cached: false,
                });
              }
            });
        });
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

function isPmtilesRequest(url) {
  return String(url.pathname || "").toLowerCase().endsWith(".pmtiles");
}

function isLikelyGreenApiRequest(req, url) {
  if (String(url.origin || "") !== String(self.location.origin || "")) return false;
  var pathname = String(url.pathname || "");
  if (!pathname.startsWith("/green/")) return false;
  if (
    pathname === "/green/" ||
    pathname === "/green/manifest.webmanifest" ||
    pathname.startsWith("/green/icons/")
  ) {
    return false;
  }
  var accept = String(req.headers.get("accept") || "").toLowerCase();
  if (accept.includes("application/json")) return true;
  if (accept.includes("application/pdf")) return true;
  if (accept.includes("application/octet-stream")) return true;
  if (accept.includes("text/csv")) return true;
  return false;
}

function parseRangeHeader(value, size) {
  if (!value) return null;
  var match = /bytes=(\d*)-(\d*)/.exec(String(value));
  if (!match) return null;
  var start = match[1] ? parseInt(match[1], 10) : 0;
  var end = match[2] ? parseInt(match[2], 10) : size - 1;
  if (!isFinite(start) || start < 0) start = 0;
  if (!isFinite(end) || end >= size) end = size - 1;
  if (start > end || start >= size) return null;
  return { start: start, end: end };
}

function responseWithRange(fullResponse, rangeHeader) {
  return fullResponse.arrayBuffer().then(function (buffer) {
    var size = buffer.byteLength || 0;
    var parsed = parseRangeHeader(rangeHeader, size);
    if (!parsed) {
      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": fullResponse.headers.get("Content-Type") || "application/octet-stream",
          "Content-Length": String(size),
          "Accept-Ranges": "bytes",
        },
      });
    }
    var chunk = buffer.slice(parsed.start, parsed.end + 1);
    return new Response(chunk, {
      status: 206,
      headers: {
        "Content-Type": fullResponse.headers.get("Content-Type") || "application/octet-stream",
        "Content-Length": String(chunk.byteLength || 0),
        "Content-Range": "bytes " + parsed.start + "-" + parsed.end + "/" + size,
        "Accept-Ranges": "bytes",
      },
    });
  });
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

  // Never intercept same-origin Green API/data requests. Let them go straight to the network.
  if (isLikelyGreenApiRequest(req, url)) return;

  // Skip API calls – let them go straight to network
  if (isSameOrigin && url.pathname.startsWith("/api/")) return;

  if (isPmtilesRequest(url)) {
    event.respondWith(
      caches.open(MAP_CACHE_NAME).then(function (mapCache) {
        return mapCache.match(url.href).then(function (cachedArchive) {
          if (cachedArchive) {
            var rangeHeader = req.headers.get("Range");
            if (rangeHeader) {
              return responseWithRange(cachedArchive.clone(), rangeHeader);
            }
            return cachedArchive;
          }

          return fetch(req)
            .then(function (resp) {
              if (!resp || !resp.ok) {
                return resp;
              }
              if (!req.headers.get("Range")) {
                event.waitUntil(mapCache.put(url.href, resp.clone()));
              }
              return resp;
            })
            .catch(function () {
              return new Response("Offline PMTiles archive unavailable", {
                status: 503,
                statusText: "Offline",
              });
            });
        });
      })
    );
    return;
  }

  /* Mapbox tile / style / font caching (network-first, cache fallback) */
  if (isMapboxRequest(url)) {
    event.respondWith(
      caches.open(MAP_CACHE_NAME).then(function (mapCache) {
        return fetch(req)
          .then(function (resp) {
            if (resp && resp.ok) {
              event.waitUntil(mapCache.put(req, resp.clone()));
            }
            return resp;
          })
          .catch(function () {
            return mapCache.match(req).then(function (cached) {
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
            var greenShellCopy =
              url.pathname === "/green" ||
              url.pathname === "/green/" ||
              url.pathname === "/"
                ? resp.clone()
                : null;
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(req, copy);
              // Also store under /green key so offline fallback always works
              if (greenShellCopy) {
                cache.put("/green", greenShellCopy);
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
