import { MAPBOX_TOKEN } from "./mapboxLoader";

type StaticMapPoint = { lng: number; lat: number };

type StaticMapFeature = {
  type: "Feature";
  geometry: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
};

type StaticProjectMapPreviewInput = {
  points: StaticMapPoint[];
  features?: StaticMapFeature[];
  mode?: string;
};

type StaticProjectMapPreview = {
  url: string;
  badge: string;
};

const STATIC_STYLE_ID = "mapbox/satellite-streets-v12";
const STATIC_SIZE = "720x360@2x";
const STATIC_PADDING = "48,48,48,48";
const MAX_STATIC_URL_LENGTH = 7600;

const modeAccent = (mode: string) => {
  if (mode === "agric") return "#b45309";
  if (mode === "relief_recovery") return "#b91c1c";
  if (mode === "csr") return "#0f766e";
  return "#15803d";
};

const modeFill = (mode: string) => {
  if (mode === "agric") return "#f59e0b";
  if (mode === "relief_recovery") return "#ef4444";
  if (mode === "csr") return "#14b8a6";
  return "#22c55e";
};

const pushCoordinatePairs = (value: unknown, bucket: number[][]) => {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  ) {
    bucket.push([value[0], value[1]]);
    return;
  }
  value.forEach((item) => pushCoordinatePairs(item, bucket));
};

const sampleLine = (coords: unknown, maxPoints = 48): number[][] => {
  if (!Array.isArray(coords)) return [];
  const line = coords.filter(
    (item): item is number[] =>
      Array.isArray(item) &&
      item.length >= 2 &&
      typeof item[0] === "number" &&
      Number.isFinite(item[0]) &&
      typeof item[1] === "number" &&
      Number.isFinite(item[1]),
  );
  if (line.length <= maxPoints) return line.map(([lng, lat]) => [lng, lat]);
  const step = Math.max(1, Math.ceil(line.length / maxPoints));
  const sampled = line.filter((_, index) => index % step === 0).map(([lng, lat]) => [lng, lat]);
  const lastPoint = line[line.length - 1];
  if (sampled.length === 0 || sampled[sampled.length - 1][0] !== lastPoint[0] || sampled[sampled.length - 1][1] !== lastPoint[1]) {
    sampled.push([lastPoint[0], lastPoint[1]]);
  }
  return sampled;
};

const closeRing = (ring: number[][]) => {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
};

const simplifyGeometry = (feature: StaticMapFeature) => {
  const geometry = feature.geometry;
  const type = String(geometry?.type || "");
  const coordinates = geometry?.coordinates;

  if (type === "Point") {
    const point = sampleLine([coordinates], 1)[0];
    if (!point) return null;
    return { type: "Point", coordinates: point };
  }

  if (type === "LineString") {
    const line = sampleLine(coordinates);
    if (line.length < 2) return null;
    return { type: "LineString", coordinates: line };
  }

  if (type === "MultiLineString" && Array.isArray(coordinates)) {
    const lines = coordinates.map((line) => sampleLine(line)).filter((line) => line.length >= 2);
    if (lines.length === 0) return null;
    return { type: "MultiLineString", coordinates: lines };
  }

  if (type === "Polygon" && Array.isArray(coordinates)) {
    const rings = coordinates.map((ring) => closeRing(sampleLine(ring))).filter((ring) => ring.length >= 4);
    if (rings.length === 0) return null;
    return { type: "Polygon", coordinates: rings };
  }

  if (type === "MultiPolygon" && Array.isArray(coordinates)) {
    const polygons = coordinates
      .map((polygon) =>
        Array.isArray(polygon)
          ? polygon.map((ring) => closeRing(sampleLine(ring))).filter((ring) => ring.length >= 4)
          : [],
      )
      .filter((polygon) => polygon.length > 0);
    if (polygons.length === 0) return null;
    return { type: "MultiPolygon", coordinates: polygons };
  }

  return null;
};

const buildOverlayCollection = (
  points: StaticMapPoint[],
  features: StaticMapFeature[],
  mode: string,
): GeoJSON.FeatureCollection => {
  const accent = modeAccent(mode);
  const fill = modeFill(mode);
  const overlayFeatures: GeoJSON.Feature[] = [];

  points.forEach((point) => {
    if (!Number.isFinite(Number(point.lng)) || !Number.isFinite(Number(point.lat))) return;
    overlayFeatures.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [Number(point.lng), Number(point.lat)],
      },
      properties: {
        "marker-color": accent,
        "marker-size": "small",
        "marker-symbol": "circle",
      },
    });
  });

  features.forEach((feature) => {
    const geometry = simplifyGeometry(feature);
    if (!geometry) return;
    overlayFeatures.push({
      type: "Feature",
      geometry: geometry as GeoJSON.Geometry,
      properties: {
        stroke: accent,
        "stroke-width": 2,
        "stroke-opacity": 0.94,
        fill,
        "fill-opacity": geometry.type.includes("Polygon") ? 0.18 : 0,
      },
    });
  });

  return {
    type: "FeatureCollection",
    features: overlayFeatures,
  };
};

const buildSingleMarkerOverlay = (points: StaticMapPoint[], features: StaticMapFeature[], mode: string) => {
  const bucket: number[][] = [];
  points.forEach((point) => {
    if (!Number.isFinite(Number(point.lng)) || !Number.isFinite(Number(point.lat))) return;
    bucket.push([Number(point.lng), Number(point.lat)]);
  });
  features.forEach((feature) => pushCoordinatePairs(feature.geometry?.coordinates, bucket));
  const [lng, lat] = bucket[0] || [7.5, 9];
  return `pin-s+${modeAccent(mode).replace("#", "")}(${lng},${lat})`;
};

const buildStaticUrl = (overlay: string) =>
  `https://api.mapbox.com/styles/v1/${STATIC_STYLE_ID}/static/${overlay}/auto/${STATIC_SIZE}?padding=${STATIC_PADDING}&access_token=${MAPBOX_TOKEN}`;

export const buildStaticProjectMapPreview = ({
  points,
  features = [],
  mode = "green",
}: StaticProjectMapPreviewInput): StaticProjectMapPreview | null => {
  if (!MAPBOX_TOKEN) return null;
  if (points.length === 0 && features.length === 0) return null;

  const fullOverlay = `geojson(${encodeURIComponent(JSON.stringify(buildOverlayCollection(points, features, mode)))})`;
  let url = buildStaticUrl(fullOverlay);
  let badge = "Static satellite preview";

  if (url.length > MAX_STATIC_URL_LENGTH && points.length > 0) {
    const pointsOnlyOverlay = `geojson(${encodeURIComponent(JSON.stringify(buildOverlayCollection(points, [], mode)))})`;
    url = buildStaticUrl(pointsOnlyOverlay);
    badge = "Static preview with verified tree points";
  }

  if (url.length > MAX_STATIC_URL_LENGTH) {
    url = buildStaticUrl(buildSingleMarkerOverlay(points, features, mode));
    badge = "Static locator preview";
  }

  return { url, badge };
};
