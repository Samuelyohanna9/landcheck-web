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

// A per-pathname guard alone isn't enough: a redirect chain through two or three routes while a
// deploy is still finishing (e.g. "/" -> "/estates/workspace" -> "/estates/login") gives each
// pathname its own one-shot budget, so the tab can silently self-reload several times in a row -
// which reads to the person watching as the loading screen "blinking" rather than one clean retry.
// This caps it at one silent auto-reload per tab session, full stop, regardless of how many
// different pathnames the redirect chain touches - anything after that goes straight to the
// visible ChunkLoadBoundary card instead of chaining more invisible reloads.
const GLOBAL_RECOVERY_ATTEMPTS_KEY = `${CHUNK_RECOVERY_STORAGE_KEY}:attempts`;
const MAX_GLOBAL_RECOVERY_ATTEMPTS = 1;

// Shared by lazyWithChunkRecovery (route/component lazy-loading, below) and
// importWithChunkRecovery (plain inline `await import(...)` calls, e.g. a library loaded on
// demand inside an event handler - CoordinateInput.tsx's CSV/Excel parsers are the first case of
// this: those chunks go stale exactly the same way a route chunk does, but they're a bare dynamic
// import rather than a React.lazy(), so they can't be wrapped by lazyWithChunkRecovery itself.
// Returns true if it performed one-shot recovery (cleared caches + triggered a reload - the
// caller should then return a never-resolving promise, since the page is about to unload), or
// false if this wasn't a recoverable chunk error (caller should rethrow the original error).
async function attemptChunkErrorRecovery(error: unknown, recoveryScope: string): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error || "");
  const canRecover =
    typeof window !== "undefined" &&
    import.meta.env.PROD &&
    CHUNK_ERROR_PATTERN.test(message);
  if (!canRecover) return false;
  const recoveryKey = `${CHUNK_RECOVERY_STORAGE_KEY}:${recoveryScope}`;
  const recoveredAlready = window.sessionStorage.getItem(recoveryKey) === "1";
  if (recoveredAlready) return false;
  const attemptsSoFar = Number(window.sessionStorage.getItem(GLOBAL_RECOVERY_ATTEMPTS_KEY) || "0");
  if (attemptsSoFar >= MAX_GLOBAL_RECOVERY_ATTEMPTS) return false;
  window.sessionStorage.setItem(recoveryKey, "1");
  window.sessionStorage.setItem(GLOBAL_RECOVERY_ATTEMPTS_KEY, String(attemptsSoFar + 1));
  // Clear Cache Storage (and nudge the service worker to check for an update) BEFORE reloading,
  // not just after - a reload alone can still be served the same stale cached chunk by the
  // service worker, making this one-shot recovery a no-op and pushing the user straight to the
  // visible failure instead.
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
  // A short, deliberate pause before reloading - retrying instantly tends to land in the exact
  // same mid-deploy window it just failed in (the container restart or build swap that caused
  // this is usually only a few seconds), so giving it a moment measurably improves the odds this
  // one allotted attempt actually succeeds instead of spending it for nothing.
  await new Promise((resolve) => window.setTimeout(resolve, 1200));
  window.location.reload();
  return true;
}

export const lazyWithChunkRecovery = <T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
) =>
  lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      const recovered = await attemptChunkErrorRecovery(error, window.location.pathname);
      if (recovered) return new Promise<{ default: T }>(() => {});
      throw error;
    }
  });

// For a plain inline `await import("some-library")` outside of React.lazy() - same stale-chunk
// recovery, usable anywhere. recoveryScope should be unique per call site (e.g. the module
// specifier) so one stale chunk's one-shot recovery doesn't suppress another's.
export const importWithChunkRecovery = async <T>(
  importer: () => Promise<T>,
  recoveryScope: string,
): Promise<T> => {
  try {
    return await importer();
  } catch (error) {
    const recovered = await attemptChunkErrorRecovery(error, recoveryScope);
    if (recovered) return new Promise<T>(() => {});
    throw error;
  }
};
