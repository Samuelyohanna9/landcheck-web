import { lazy, type ComponentType } from "react";

// Shared by App.tsx (top-level routes) AND every page/component that lazy-loads a nested chunk
// (map panels, modals, step panels, etc.) - a stale page shell trying to fetch a chunk that no
// longer exists after a new deploy used to surface App.tsx's visible "This page needs a fresh
// reload" card immediately for any of those nested imports, since only the top-level routes had
// this recovery wrapper. Wrapping every `lazy(() => import(...))` in the app with this instead
// means a stale-chunk failure is silently recovered (cache clear + one reload) before the user
// ever sees anything, regardless of which component's chunk actually went stale.
export const CHUNK_RECOVERY_STORAGE_KEY = "landcheck.chunk-recovery";
const CHUNK_ERROR_PATTERN = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i;

export const lazyWithChunkRecovery = <T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
) =>
  lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      const canRecover =
        typeof window !== "undefined" &&
        import.meta.env.PROD &&
        CHUNK_ERROR_PATTERN.test(message);
      if (canRecover) {
        const recoveryKey = `${CHUNK_RECOVERY_STORAGE_KEY}:${window.location.pathname}`;
        const recoveredAlready = window.sessionStorage.getItem(recoveryKey) === "1";
        if (!recoveredAlready) {
          window.sessionStorage.setItem(recoveryKey, "1");
          // Clear Cache Storage (and nudge the service worker to check for an update) BEFORE
          // reloading, not just after - a reload alone can still be served the same stale
          // cached chunk by the service worker, making this one-shot recovery a no-op and
          // pushing the user straight to the visible ChunkLoadBoundary card in App.tsx.
          try {
            if ("caches" in window) {
              const cacheKeys = await caches.keys();
              await Promise.all(cacheKeys.map((key) => caches.delete(key)));
            }
            if ("serviceWorker" in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              await Promise.all(registrations.map((registration) => registration.update().catch(() => {})));
            }
          } catch {
            // Best-effort cleanup - still reload even if clearing caches failed.
          }
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw error;
    }
  });
