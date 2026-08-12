import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

export type HazardValuePoint = { lng: number; lat: number; [key: string]: number };

export type HazardInteractiveMeta = {
  image_width: number;
  image_height: number;
  axes_pixel_bbox: [number, number, number, number];
  bounds_wgs84: { west: number; south: number; east: number; north: number };
  value_points: HazardValuePoint[];
  value_key: string;
  snap_threshold_m: number;
};

type Props = {
  src: string;
  alt: string;
  interactive?: HazardInteractiveMeta | null;
};

const VALUE_LABELS: Record<string, { label: string; unit: string; decimals: number }> = {
  depth_m: { label: "Flood depth", unit: " m", decimals: 2 },
  slope_deg: { label: "Slope", unit: "°", decimals: 1 },
  elevation_m: { label: "Elevation", unit: " m", decimals: 1 },
};

// Small enough analysis extents (a few hundred metres to a couple km) that an equirectangular
// approximation is well within the precision this "identify" tool needs - a true haversine
// calculation would add complexity for no visible benefit at this scale.
function nearestValue(
  lng: number, lat: number, points: HazardValuePoint[], valueKey: string, thresholdM: number,
): number | null {
  if (!points.length) return null;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  let best: HazardValuePoint | null = null;
  let bestDist = Infinity;
  for (const p of points) {
    const dx = (p.lng - lng) * metersPerDegLng;
    const dy = (p.lat - lat) * metersPerDegLat;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  if (!best || bestDist > thresholdM) return null;
  const value = best[valueKey];
  return typeof value === "number" ? value : null;
}

export default function HazardInteractiveOverlay({ src, alt, interactive }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [pinned, setPinned] = useState(false);

  const resolveAt = useCallback((clientX: number, clientY: number): { x: number; y: number; text: string } | null => {
    if (!interactive || !imgRef.current || !wrapRef.current) return null;
    const imgRect = imgRef.current.getBoundingClientRect();
    const wrapRect = wrapRef.current.getBoundingClientRect();
    const scaleX = interactive.image_width / imgRect.width;
    const scaleY = interactive.image_height / imgRect.height;
    const px = (clientX - imgRect.left) * scaleX;
    const py = (clientY - imgRect.top) * scaleY;
    const [ax0, ay0, ax1, ay1] = interactive.axes_pixel_bbox;
    if (px < ax0 || px > ax1 || py < ay0 || py > ay1) return null;

    const fx = (px - ax0) / (ax1 - ax0);
    const fy = (py - ay0) / (ay1 - ay0);
    const { west, south, east, north } = interactive.bounds_wgs84;
    const lng = west + fx * (east - west);
    const lat = north - fy * (north - south);

    const value = nearestValue(lng, lat, interactive.value_points, interactive.value_key, interactive.snap_threshold_m);
    const meta = VALUE_LABELS[interactive.value_key] || { label: interactive.value_key, unit: "", decimals: 2 };
    const text = value != null
      ? `${meta.label}: ${value.toFixed(meta.decimals)}${meta.unit}`
      : "No data at this point";

    return { x: clientX - wrapRect.left, y: clientY - wrapRect.top, text };
  }, [interactive]);

  const handleMove = (e: ReactMouseEvent<HTMLImageElement>) => {
    if (!interactive || pinned) return;
    const { clientX, clientY } = e;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setTooltip(resolveAt(clientX, clientY));
    });
  };

  const handleLeave = () => {
    if (!pinned) setTooltip(null);
  };

  const handleClick = (e: ReactMouseEvent<HTMLImageElement>) => {
    if (!interactive) return;
    const result = resolveAt(e.clientX, e.clientY);
    setTooltip(result);
    setPinned(!!result);
  };

  return (
    <div className="hazard-interactive-wrap" ref={wrapRef}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="hazard-interactive-img"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={handleClick}
        loading="lazy"
        decoding="async"
      />
      {tooltip && (
        <div
          className={`hazard-interactive-tooltip ${pinned ? "hazard-interactive-tooltip--pinned" : ""}`}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
      {interactive && (
        <div className="hazard-interactive-hint">Hover or tap the map to read values</div>
      )}
    </div>
  );
}
