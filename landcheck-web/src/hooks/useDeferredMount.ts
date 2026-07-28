import { useEffect, useState } from "react";

export function useDeferredMount(delayMs = 900) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setReady(true);
      return undefined;
    }

    const timerId = window.setTimeout(() => setReady(true), delayMs);
    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => setReady(true), { timeout: delayMs })
        : null;

    return () => {
      window.clearTimeout(timerId);
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [delayMs]);

  return ready;
}
