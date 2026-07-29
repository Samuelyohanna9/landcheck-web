var SHELL_CACHE_NAME = "landcheck-shell-v15";
var STATIC_CACHE_NAME = "landcheck-static-v15";
var IMAGE_CACHE_NAME = "landcheck-images-v3";
var MAP_CACHE_NAME = "landcheck-map-v7";
var SYNC_TAG = "green-sync-queue";

var PRECACHE_URLS = [
  "/",
  "/green",
  "/green/manifest.webmanifest",
  "/green/icons/icon-192.png",
  "/green/icons/icon-512.png",
  "/green/icons/icon-512-maskable.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then(function (cache) {
      return Promise.allSettled(
        PRECACHE_URLS.map(function (url) {
          return cache.add(url).catch(function () {
            return null;
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  var activeCacheNames = [
    SHELL_CACHE_NAME,
    STATIC_CACHE_NAME,
    IMAGE_CACHE_NAME,
    MAP_CACHE_NAME,
  ];

  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return activeCacheNames.indexOf(key) === -1;
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

self.addEventListener("sync", function (event) {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clients) {
        clients.forEach(function (client) {
          client.postMessage({ type: "GREEN_SYNC_QUEUE" });
        });
      })
      .catch(function () {
        return null;
      })
  );
});

self.addEventListener("message", function (event) {
  var data = event.data || {};

  if (data.type === "PRECACHE_MAP_TILES") {
    var urls = data.urls || [];
    if (urls.length === 0) return;

    event.waitUntil(
      caches.open(MAP_CACHE_NAME).then(function (cache) {
        var completed = 0;
        var total = urls.length;
        var batchSize = 6;

        function fetchBatch(startIndex) {
          var batch = urls.slice(startIndex, startIndex + batchSize);
          if (batch.length === 0) {
            if (event.source) {
              event.source.postMessage({
                type: "PRECACHE_MAP_TILES_DONE",
                cached: completed,
                total: total,
              });
            }
            return Promise.resolve();
          }

          return Promise.allSettled(
            batch.map(function (url) {
              return cache.match(url).then(function (existing) {
                if (existing) {
                  completed += 1;
                  return null;
                }
                return fetch(url)
                  .then(function (resp) {
                    if (resp && resp.ok) {
                      completed += 1;
                      return cache.put(url, resp);
                    }
                    return null;
                  })
                  .catch(function () {
                    return null;
                  });
              });
            })
          ).then(function () {
            if (event.source) {
              event.source.postMessage({
                type: "PRECACHE_MAP_TILES_PROGRESS",
                cached: completed,
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

  if (data.type === "PRECACHE_BUILD_ASSETS") {
    var assetUrls = data.urls || [];
    if (assetUrls.length === 0) return;

    event.waitUntil(
      caches.open(STATIC_CACHE_NAME).then(function (cache) {
        return Promise.allSettled(
          assetUrls.map(function (url) {
            return cache.match(url).then(function (existing) {
              if (existing) return null;
              return fetch(url)
                .then(function (resp) {
                  if (resp && resp.ok && !isHtmlResponse(resp)) {
                    return cache.put(url, resp);
                  }
                  return null;
                })
                .catch(function () {
                  return null;
                });
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
            return null;
          }

          return fetch(pmtilesUrl, { cache: "reload" })
            .then(function (resp) {
              if (!resp || !resp.ok) {
                throw new Error("Failed to cache PMTiles archive");
              }
              return cache.put(pmtilesUrl, resp.clone()).then(function () {
                if (event.source) {
                  event.source.postMessage({
                    type: "PRECACHE_PMTILES_DONE",
                    url: pmtilesUrl,
                    cached: true,
                  });
                }
              });
            })
            .catch(function () {
              if (event.source) {
                event.source.postMessage({
                  type: "PRECACHE_PMTILES_DONE",
                  url: pmtilesUrl,
                  cached: false,
                });
              }
              return null;
            });
        });
      })
    );
  }
});

function isHtmlResponse(resp) {
  if (!resp) return false;
  return String(resp.headers.get("Content-Type") || "").toLowerCase().includes("text/html");
}

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

function isLikelySameOriginApiRequest(request, url) {
  if (String(url.origin || "") !== String(self.location.origin || "")) return false;
  if (String(url.pathname || "").startsWith("/api/")) return true;

  var accept = String(request.headers.get("accept") || "").toLowerCase();
  return (
    accept.includes("application/json") ||
    accept.includes("application/pdf") ||
    accept.includes("application/octet-stream") ||
    accept.includes("text/csv")
  );
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

function findCachedShell(request) {
  return caches.open(SHELL_CACHE_NAME).then(function (cache) {
    return cache
      .match(request)
      .then(function (resp) {
        if (resp) return resp;
        return cache.match("/");
      })
      .then(function (resp) {
        if (resp) return resp;
        return cache.match("/green");
      })
      .then(function (resp) {
        if (resp) return resp;
        return cache.match(self.registration.scope);
      });
  });
}

function isNavigationRequest(request, url) {
  if (request.mode !== "navigate") return false;
  if (url.origin !== self.location.origin) return false;
  if (String(url.pathname || "").startsWith("/api/")) return false;
  return true;
}

function isStaticAssetRequest(request, url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/assets/") ||
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "worker" ||
    request.destination === "font"
  );
}

function isImageLikeRequest(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (request.destination === "image" || request.destination === "video") return true;
  return /\.(png|jpg|jpeg|webp|avif|gif|svg|mp4|webm)$/i.test(url.pathname);
}

function networkFirst(request, cacheName, options) {
  return caches.open(cacheName).then(function (cache) {
    return fetch(request)
      .then(function (response) {
        if (response && response.ok && (!options || !options.skipCache || !options.skipCache(response))) {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(function () {
        return cache.match(request).then(function (cached) {
          if (cached) return cached;
          if (options && typeof options.fallback === "function") {
            return options.fallback();
          }
          return new Response("Offline", { status: 503, statusText: "Offline" });
        });
      });
  });
}

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var networkFetch = fetch(request)
        .then(function (response) {
          if (response && response.ok && !isHtmlResponse(response)) {
            cache.put(request, response.clone());
            return response;
          }
          return null;
        })
        .catch(function () {
          return null;
        });

      if (cached && !isHtmlResponse(cached)) {
        return networkFetch.then(function () {
          return cached;
        });
      }

      return networkFetch.then(function (response) {
        if (response && !isHtmlResponse(response)) return response;
        if (cached && !isHtmlResponse(cached)) return cached;
        return new Response("Asset unavailable", { status: 503, statusText: "Asset unavailable" });
      });
    });
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);
  var isSameOrigin = url.origin === self.location.origin;

  if (request.method !== "GET") return;
  if (isLikelySameOriginApiRequest(request, url)) return;

  if (isPmtilesRequest(url)) {
    event.respondWith(
      caches.open(MAP_CACHE_NAME).then(function (mapCache) {
        return mapCache.match(url.href).then(function (cachedArchive) {
          if (cachedArchive) {
            var rangeHeader = request.headers.get("Range");
            if (rangeHeader) {
              return responseWithRange(cachedArchive.clone(), rangeHeader);
            }
            return cachedArchive;
          }

          return fetch(request)
            .then(function (response) {
              if (response && response.ok && !request.headers.get("Range")) {
                event.waitUntil(mapCache.put(url.href, response.clone()));
              }
              return response;
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

  if (isMapboxRequest(url)) {
    event.respondWith(
      networkFirst(request, MAP_CACHE_NAME, {
        fallback: function () {
          return caches.open(MAP_CACHE_NAME).then(function (mapCache) {
            return mapCache.match(request).then(function (cached) {
              if (cached) return cached;
              if (url.pathname.includes("/tiles/") || url.pathname.includes("/v4/")) {
                return new Response(
                  Uint8Array.from(
                    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTkSuQmCC"),
                    function (char) {
                      return char.charCodeAt(0);
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
        },
      })
    );
    return;
  }

  if (!isSameOrigin) return;

  if (isNavigationRequest(request, url)) {
    event.respondWith(
      networkFirst(request, SHELL_CACHE_NAME, {
        fallback: function () {
          return findCachedShell(request).then(function (response) {
            return (
              response ||
              new Response(
                '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LandCheck - Offline</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0b1f16;color:#efffec;text-align:center}h1{font-size:1.4rem;margin-bottom:0.5rem}p{color:#a0c9a8}</style></head><body><div><h1>You are offline</h1><p>Please reconnect and reload.</p></div></body></html>',
                {
                  status: 200,
                  headers: { "Content-Type": "text/html; charset=utf-8" },
                }
              )
            );
          });
        },
      })
    );
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE_NAME));
    return;
  }

  if (isImageLikeRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE_NAME));
  }
});
