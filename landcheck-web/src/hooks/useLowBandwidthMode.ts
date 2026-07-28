import { useEffect, useState } from "react";

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

function getConnection() {
  if (typeof navigator === "undefined") return null;
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
}

function detectLowBandwidth(connection: ConnectionLike | null) {
  if (!connection) return false;
  if (connection.saveData) return true;
  return ["slow-2g", "2g", "3g"].includes(String(connection.effectiveType || "").toLowerCase());
}

export function useLowBandwidthMode() {
  const [isLowBandwidth, setIsLowBandwidth] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const connection = getConnection();
    const update = () => setIsLowBandwidth(detectLowBandwidth(connection));

    update();

    if (!connection || typeof connection.addEventListener !== "function") {
      return undefined;
    }

    connection.addEventListener("change", update);
    return () => {
      connection.removeEventListener?.("change", update);
    };
  }, []);

  return { isLowBandwidth };
}
