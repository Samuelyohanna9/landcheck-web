import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

export type HazardValuePoint = { lng: number; lat: number; [key: string]: number };
export type HazardBuildingFootprint = { threatened: boolean; rings: [number, number][][] };

export type HazardInteractiveMeta = {
  image_width: number;
  image_height: number;
  axes_pixel_bbox: [number, number, number, number];
  bounds_wgs84: { west: number; south: number; east: number; north: number };
  value_points: HazardValuePoint[];
  value_key: string;
  snap_threshold_m: number;
  contour_points?: HazardValuePoint[];
  contour_snap_threshold_m?: number;
  buildings?: HazardBuildingFootprint[];
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
  flood_susceptibility_pct: { label: "Flood susceptibility", unit: "%", decimals: 0 },
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

function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

type IndexedBuilding = HazardBuildingFootprint & { bbox: [number, number, number, number] };

function indexBuildings(buildings: HazardBuildingFootprint[]): IndexedBuilding[] {
  return buildings.map((b) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ring of b.rings) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { ...b, bbox: [minX, minY, maxX, maxY] };
  });
}

function findBuilding(lng: number, lat: number, buildings: IndexedBuilding[]): HazardBuildingFootprint | null {
  for (const b of buildings) {
    const [minX, minY, maxX, maxY] = b.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    for (const ring of b.rings) {
      if (pointInRing(lng, lat, ring)) return b;
    }
  }
  return null;
}

export default function HazardInteractiveOverlay({ src, alt, interactive }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const [pinned, setPinned] = useState(false);

  const indexedBuildings = useMemo(
    () => indexBuildings(interactive?.buildings || []),
    [interactive],
  );

  const resolveAt = useCallback((clientX: number, clientY: number): { x: number; y: number; lines: string[] } | null => {
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

    const lines: string[] = [];

    const value = nearestValue(lng, lat, interactive.value_points, interactive.value_key, interactive.snap_threshold_m);
    const meta = VALUE_LABELS[interactive.value_key] || { label: interactive.value_key, unit: "", decimals: 2 };
    lines.push(value != null ? `${meta.label}: ${value.toFixed(meta.decimals)}${meta.unit}` : "No hazard data at this point");

    if (interactive.contour_points?.length) {
      const elevation = nearestValue(
        lng, lat, interactive.contour_points, "elevation_m", interactive.contour_snap_threshold_m ?? 150,
      );
      if (elevation != null) lines.push(`Elevation: ${elevation.toFixed(0)} m`);
    }

    const building = findBuilding(lng, lat, indexedBuildings);
    if (building) lines.push(building.threatened ? "Building: threatened" : "Building: not threatened");

    return { x: clientX - wrapRect.left, y: clientY - wrapRect.top, lines };
  }, [interactive, indexedBuildings]);

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
          {tooltip.lines.map((line, i) => (
            <div key={i} className={i === 0 ? "hazard-interactive-tooltip-primary" : "hazard-interactive-tooltip-secondary"}>
              {line}
            </div>
          ))}
        </div>
      )}
      {interactive && (
        <div className="hazard-interactive-hint">Hover or tap the map to read values</div>
      )}
    </div>
  );
}
