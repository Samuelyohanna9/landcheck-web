import { useCallback, useEffect, useState } from "react";

type ConnectionLike = {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

declare global {
  interface Navigator {
    connection?: ConnectionLike;
    mozConnection?: ConnectionLike;
    webkitConnection?: ConnectionLike;
  }
}

// navigator.connection is Chromium-only (Safari/iOS never reports it), so this manual,
// persisted opt-in is the only way those users can ever get low-bandwidth behavior.
const MANUAL_LOW_BANDWIDTH_STORAGE_KEY = "lc_manual_low_bandwidth";

function getConnection() {
  if (typeof navigator === "undefined") return null;
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
}

function detectLowBandwidth(connection: ConnectionLike | null) {
  if (!connection) return false;
  if (connection.saveData) return true;
  return ["slow-2g", "2g", "3g"].includes(String(connection.effectiveType || "").toLowerCase());
}

function readManualLowBandwidth() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MANUAL_LOW_BANDWIDTH_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useLowBandwidthMode() {
  const [autoLowBandwidth, setAutoLowBandwidth] = useState(false);
  const [manualLowBandwidth, setManualLowBandwidthState] = useState(readManualLowBandwidth);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const connection = getConnection();
    const update = () => setAutoLowBandwidth(detectLowBandwidth(connection));

    update();

    if (!connection || typeof connection.addEventListener !== "function") {
      return undefined;
    }

    connection.addEventListener("change", update);
    return () => {
      connection.removeEventListener?.("change", update);
    };
  }, []);

  const setManualLowBandwidth = useCallback((value: boolean) => {
    setManualLowBandwidthState(value);
    if (typeof window === "undefined") return;
    try {
      if (value) {
        window.localStorage.setItem(MANUAL_LOW_BANDWIDTH_STORAGE_KEY, "1");
      } else {
        window.localStorage.removeItem(MANUAL_LOW_BANDWIDTH_STORAGE_KEY);
      }
    } catch {
      // Storage unavailable (private browsing, quota) - the in-memory state still applies
      // for the rest of this session, it just won't persist across reloads.
    }
  }, []);

  return {
    isLowBandwidth: autoLowBandwidth || manualLowBandwidth,
    manualLowBandwidth,
    setManualLowBandwidth,
  };
}
