import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import toast from "react-hot-toast";
import "../styles/feature-override-modal.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

type FeatureType = "road" | "building" | "river" | "fence";
type FeatureAction = "add" | "delete" | "update";
type EditorTool = "select" | "draw_line_string" | "draw_polygon";
type BasemapMode = "satellite" | "plotting";
type LayerVisibility = Record<FeatureType | "boundary", boolean>;
type FeatureInventory = Record<FeatureType, number>;
type FeatureCollectionState = Record<FeatureType, { type: "FeatureCollection"; features: any[] }>;

type GeometryMetrics = {
  geometryType: string;
  vertices: number;
  lengthM: number;
  perimeterM: number;
  areaSqm: number;
};

type PlottingCamera = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

type FeatureRecord = {
  key: string;
  type: FeatureType;
  label: string;
  properties: Record<string, any>;
  geometry: any;
  metrics: GeometryMetrics | null;
  coordinates: number[][];
};

type DraftingAssistState = {
  snap: boolean;
  ortho: boolean;
  measure: boolean;
};

type OsnapModes = {
  endpoint: boolean;
  midpoint: boolean;
  intersection: boolean;
};

type SelectionMode = "box" | "lasso" | null;

type SelectionDrag =
  | {
      mode: "box";
      start: { x: number; y: number };
      current: { x: number; y: number };
    }
  | {
      mode: "lasso";
      points: Array<{ x: number; y: number }>;
    }
  | null;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: { feature_type: FeatureType; action: FeatureAction; name?: string; width_m?: number; geojson: any }) => void;
  plotCoords: number[][] | null;
  featureType: FeatureType;
  setFeatureType: (t: FeatureType) => void;
  action: FeatureAction;
  setAction: (a: FeatureAction) => void;
  roadName: string;
  setRoadName: (v: string) => void;
  roadWidth: "2" | "4" | "6" | "8" | "10" | "12" | "15" | "20" | "30";
  setRoadWidth: (v: "2" | "4" | "6" | "8" | "10" | "12" | "15" | "20" | "30") => void;
  plotId: number | null;
};

const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  road: true,
  building: true,
  river: true,
  fence: true,
  boundary: true,
};

const DEFAULT_INVENTORY: FeatureInventory = {
  road: 0,
  building: 0,
  river: 0,
  fence: 0,
};

const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection" as const, features: [] as any[] };

const DEFAULT_FEATURE_COLLECTIONS: FeatureCollectionState = {
  road: EMPTY_FEATURE_COLLECTION,
  building: EMPTY_FEATURE_COLLECTION,
  river: EMPTY_FEATURE_COLLECTION,
  fence: EMPTY_FEATURE_COLLECTION,
};

const PLOTTING_VIEWPORT_WIDTH = 1280;
const PLOTTING_VIEWPORT_HEIGHT = 820;
const PLOTTING_VIEWPORT_PADDING = 84;
const DEFAULT_PLOTTING_CAMERA: PlottingCamera = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

const DEFAULT_DRAFTING_ASSIST: DraftingAssistState = {
  snap: true,
  ortho: false,
  measure: true,
};

const DEFAULT_OSNAP_MODES: OsnapModes = {
  endpoint: true,
  midpoint: true,
  intersection: true,
};

const EARTH_RADIUS_M = 6371008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const haversineDistanceMeters = (start: number[], end: number[]) => {
  const [lng1, lat1] = start;
  const [lng2, lat2] = end;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
};

const lineLengthMeters = (coords: number[][]) => {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < coords.length; index += 1) {
    total += haversineDistanceMeters(coords[index - 1], coords[index]);
  }
  return total;
};

const closeRing = (ring: number[][]) => {
  if (!Array.isArray(ring) || ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first?.[0] === last?.[0] && first?.[1] === last?.[1]) return ring;
  return [...ring, first];
};

const polygonRingAreaSqm = (ringRaw: number[][]) => {
  const ring = closeRing(ringRaw);
  if (ring.length < 4) return 0;
  const origin = ring[0];
  const originLng = Number(origin?.[0] || 0);
  const originLat = Number(origin?.[1] || 0);
  const cosLat = Math.cos(toRadians(originLat));
  const projected = ring.map((point) => {
    const lng = Number(point?.[0] || 0);
    const lat = Number(point?.[1] || 0);
    return [
      (toRadians(lng - originLng) * EARTH_RADIUS_M * cosLat),
      (toRadians(lat - originLat) * EARTH_RADIUS_M),
    ];
  });
  let area = 0;
  for (let index = 0; index < projected.length - 1; index += 1) {
    const [x0, y0] = projected[index];
    const [x1, y1] = projected[index + 1];
    area += x0 * y1 - x1 * y0;
  }
  return Math.abs(area) / 2;
};

const polygonAreaSqm = (rings: number[][][]) => {
  if (!Array.isArray(rings) || !rings.length) return 0;
  const [outer, ...holes] = rings;
  const holeArea = holes.reduce((sum, ring) => sum + polygonRingAreaSqm(ring), 0);
  return Math.max(polygonRingAreaSqm(outer) - holeArea, 0);
};

const polygonPerimeterMeters = (rings: number[][][]) => {
  if (!Array.isArray(rings) || !rings.length) return 0;
  return rings.reduce((sum, ring) => sum + lineLengthMeters(closeRing(ring)), 0);
};

const countVertices = (geometry: any) => {
  if (!geometry) return 0;
  if (geometry.type === "LineString") return Array.isArray(geometry.coordinates) ? geometry.coordinates.length : 0;
  if (geometry.type === "Polygon") {
    const rings = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    return rings.reduce((sum: number, ring: number[][]) => {
      const safe = closeRing(ring);
      return sum + Math.max(safe.length - 1, 0);
    }, 0);
  }
  return 0;
};

const getGeometryMetrics = (geometry: any): GeometryMetrics | null => {
  if (!geometry?.type) return null;
  if (geometry.type === "LineString") {
    return {
      geometryType: "Line",
      vertices: countVertices(geometry),
      lengthM: lineLengthMeters(Array.isArray(geometry.coordinates) ? geometry.coordinates : []),
      perimeterM: 0,
      areaSqm: 0,
    };
  }
  if (geometry.type === "Polygon") {
    const rings = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    return {
      geometryType: "Polygon",
      vertices: countVertices(geometry),
      lengthM: 0,
      perimeterM: polygonPerimeterMeters(rings),
      areaSqm: polygonAreaSqm(rings),
    };
  }
  return null;
};

const formatLength = (meters: number) => {
  if (!Number.isFinite(meters) || meters <= 0) return "0 m";
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${meters.toFixed(1)} m`;
};

const formatArea = (sqm: number) => {
  if (!Number.isFinite(sqm) || sqm <= 0) return "0 sqm";
  if (sqm >= 10000) return `${(sqm / 10000).toFixed(3)} ha`;
  return `${sqm.toFixed(2)} sqm`;
};

const getBoundsBox = (coords: number[][] | null) => {
  if (!coords?.length) {
    return { minLng: 7.45, maxLng: 7.55, minLat: 8.95, maxLat: 9.05 };
  }
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  coords.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, Number(lng || 0));
    maxLng = Math.max(maxLng, Number(lng || 0));
    minLat = Math.min(minLat, Number(lat || 0));
    maxLat = Math.max(maxLat, Number(lat || 0));
  });
  return { minLng, maxLng, minLat, maxLat };
};

const expandBoundsBox = (
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  factor = 0.22
) => {
  const width = Math.max(bounds.maxLng - bounds.minLng, 0.0025);
  const height = Math.max(bounds.maxLat - bounds.minLat, 0.0025);
  return {
    minLng: bounds.minLng - width * factor,
    maxLng: bounds.maxLng + width * factor,
    minLat: bounds.minLat - height * factor,
    maxLat: bounds.maxLat + height * factor,
  };
};

const chooseGridStep = (span: number) => {
  const candidates = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05];
  const safeSpan = Math.max(span, 0.001);
  return candidates.find((step) => safeSpan / step <= 12) || candidates[candidates.length - 1];
};

const buildCadOverlayData = (coords: number[][] | null) => {
  const plotBounds = expandBoundsBox(getBoundsBox(coords), 0.28);
  const lngStep = chooseGridStep(plotBounds.maxLng - plotBounds.minLng);
  const latStep = chooseGridStep(plotBounds.maxLat - plotBounds.minLat);
  const majorEvery = 4;

  const lineFeatures: any[] = [];
  let index = 0;

  const startLng = Math.floor(plotBounds.minLng / lngStep) * lngStep;
  for (let lng = startLng; lng <= plotBounds.maxLng + lngStep; lng += lngStep) {
    lineFeatures.push({
      type: "Feature",
      properties: { kind: index % majorEvery === 0 ? "major" : "minor" },
      geometry: {
        type: "LineString",
        coordinates: [
          [Number(lng.toFixed(6)), plotBounds.minLat],
          [Number(lng.toFixed(6)), plotBounds.maxLat],
        ],
      },
    });
    index += 1;
  }

  index = 0;
  const startLat = Math.floor(plotBounds.minLat / latStep) * latStep;
  for (let lat = startLat; lat <= plotBounds.maxLat + latStep; lat += latStep) {
    lineFeatures.push({
      type: "Feature",
      properties: { kind: index % majorEvery === 0 ? "major" : "minor" },
      geometry: {
        type: "LineString",
        coordinates: [
          [plotBounds.minLng, Number(lat.toFixed(6))],
          [plotBounds.maxLng, Number(lat.toFixed(6))],
        ],
      },
    });
    index += 1;
  }

  const maskFeature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[
        [plotBounds.minLng, plotBounds.minLat],
        [plotBounds.maxLng, plotBounds.minLat],
        [plotBounds.maxLng, plotBounds.maxLat],
        [plotBounds.minLng, plotBounds.maxLat],
        [plotBounds.minLng, plotBounds.minLat],
      ]],
    },
  };

  return {
    mask: { type: "FeatureCollection", features: [maskFeature] },
    grid: { type: "FeatureCollection", features: lineFeatures },
  };
};

const collectGeometryCoordinates = (geometry: any, target: number[][]) => {
  if (!geometry?.type) return;
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach((point: number[]) => {
      if (Array.isArray(point) && point.length >= 2) target.push([Number(point[0]), Number(point[1])]);
    });
    return;
  }
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach((ring: number[][]) => {
      if (!Array.isArray(ring)) return;
      ring.forEach((point: number[]) => {
        if (Array.isArray(point) && point.length >= 2) target.push([Number(point[0]), Number(point[1])]);
      });
    });
  }
};

const buildGeometryFromPoints = (points: number[][], tool: EditorTool) => {
  if (!Array.isArray(points) || !points.length) return null;
  if (tool === "draw_polygon") {
    if (points.length < 3) return null;
    return {
      type: "Polygon",
      coordinates: [closeRing(points)],
    };
  }
  if (points.length < 2) return null;
  return {
    type: "LineString",
    coordinates: points,
  };
};

const chooseCadGridStepMeters = (spanMeters: number) => {
  const candidates = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const safeSpan = Math.max(spanMeters, 10);
  return candidates.find((step) => safeSpan / step <= 18) || candidates[candidates.length - 1];
};

const buildPlottingViewport = (params: {
  plotCoords: number[][] | null;
  featureCollections: FeatureCollectionState;
  selectedGeometry: any;
  draftGeometry: any;
}) => {
  const coordinates: number[][] = [];
  if (Array.isArray(params.plotCoords)) {
    params.plotCoords.forEach((point) => {
      if (Array.isArray(point) && point.length >= 2) coordinates.push([Number(point[0]), Number(point[1])]);
    });
  }
  (Object.values(params.featureCollections) || []).forEach((collection) => {
    collection?.features?.forEach((feature: any) => collectGeometryCoordinates(feature?.geometry, coordinates));
  });
  collectGeometryCoordinates(params.selectedGeometry, coordinates);
  collectGeometryCoordinates(params.draftGeometry, coordinates);

  if (!coordinates.length) {
    coordinates.push([7.5, 9.0], [7.505, 9.005]);
  }

  const avgLat = coordinates.reduce((sum, [, lat]) => sum + lat, 0) / coordinates.length;
  const cosLat = Math.max(Math.cos(toRadians(avgLat)), 0.2);
  const referenceLng = coordinates[0][0];
  const referenceLat = coordinates[0][1];

  const projected = coordinates.map(([lng, lat]) => ({
    x: toRadians(lng - referenceLng) * EARTH_RADIUS_M * cosLat,
    y: toRadians(lat - referenceLat) * EARTH_RADIUS_M,
  }));

  let minX = Math.min(...projected.map((point) => point.x));
  let maxX = Math.max(...projected.map((point) => point.x));
  let minY = Math.min(...projected.map((point) => point.y));
  let maxY = Math.max(...projected.map((point) => point.y));

  const spanX = Math.max(maxX - minX, 20);
  const spanY = Math.max(maxY - minY, 20);
  const padX = spanX * 0.14;
  const padY = spanY * 0.14;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const innerWidth = PLOTTING_VIEWPORT_WIDTH - PLOTTING_VIEWPORT_PADDING * 2;
  const innerHeight = PLOTTING_VIEWPORT_HEIGHT - PLOTTING_VIEWPORT_PADDING * 2;
  const scale = Math.min(innerWidth / Math.max(maxX - minX, 1), innerHeight / Math.max(maxY - minY, 1));

  const project = (coord: number[]) => {
    const x = toRadians(coord[0] - referenceLng) * EARTH_RADIUS_M * cosLat;
    const y = toRadians(coord[1] - referenceLat) * EARTH_RADIUS_M;
    return {
      x: PLOTTING_VIEWPORT_PADDING + (x - minX) * scale,
      y: PLOTTING_VIEWPORT_HEIGHT - PLOTTING_VIEWPORT_PADDING - (y - minY) * scale,
    };
  };

  const unproject = (point: { x: number; y: number }) => {
    const xMeters = minX + (point.x - PLOTTING_VIEWPORT_PADDING) / scale;
    const yMeters = minY + (PLOTTING_VIEWPORT_HEIGHT - PLOTTING_VIEWPORT_PADDING - point.y) / scale;
    return [
      referenceLng + (xMeters / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI),
      referenceLat + (yMeters / EARTH_RADIUS_M) * (180 / Math.PI),
    ] as [number, number];
  };

  return {
    width: PLOTTING_VIEWPORT_WIDTH,
    height: PLOTTING_VIEWPORT_HEIGHT,
    minX,
    maxX,
    minY,
    maxY,
    scale,
    project,
    unproject,
    gridStepMeters: chooseCadGridStepMeters(Math.max(maxX - minX, maxY - minY)),
  };
};

const pointsToSvg = (coords: number[][], project: (coord: number[]) => { x: number; y: number }) =>
  coords
    .map((coord) => {
      const point = project(coord);
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    })
    .join(" ");

const getFeatureLabelPoint = (geometry: any, project: (coord: number[]) => { x: number; y: number }) => {
  const coords: number[][] = [];
  collectGeometryCoordinates(geometry, coords);
  if (!coords.length) return null;
  const avg = coords.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
    { lng: 0, lat: 0 }
  );
  return project([avg.lng / coords.length, avg.lat / coords.length]);
};

const geometryToCoordinateList = (geometry: any) => {
  const coordinates: number[][] = [];
  collectGeometryCoordinates(geometry, coordinates);
  return coordinates;
};

const formatCoordinateValue = (value: number) => Number.isFinite(value) ? value.toFixed(6) : "--";

const midpointCoordinate = (start: number[], end: number[]) => [
  (Number(start?.[0] || 0) + Number(end?.[0] || 0)) / 2,
  (Number(start?.[1] || 0) + Number(end?.[1] || 0)) / 2,
] as [number, number];

const getGeometrySegments = (geometry: any) => {
  const segments: Array<{ start: number[]; end: number[] }> = [];
  if (!geometry?.type) return segments;
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    for (let index = 1; index < geometry.coordinates.length; index += 1) {
      const start = geometry.coordinates[index - 1];
      const end = geometry.coordinates[index];
      if (Array.isArray(start) && Array.isArray(end)) {
        segments.push({ start, end });
      }
    }
    return segments;
  }
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach((ring: number[][]) => {
      const closed = closeRing(ring);
      for (let index = 1; index < closed.length; index += 1) {
        const start = closed[index - 1];
        const end = closed[index];
        if (Array.isArray(start) && Array.isArray(end)) {
          segments.push({ start, end });
        }
      }
    });
  }
  return segments;
};

const getSegmentIntersection = (a1: number[], a2: number[], b1: number[], b2: number[]) => {
  const x1 = Number(a1?.[0] || 0);
  const y1 = Number(a1?.[1] || 0);
  const x2 = Number(a2?.[0] || 0);
  const y2 = Number(a2?.[1] || 0);
  const x3 = Number(b1?.[0] || 0);
  const y3 = Number(b1?.[1] || 0);
  const x4 = Number(b2?.[0] || 0);
  const y4 = Number(b2?.[1] || 0);

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < 1e-12) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denominator;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)] as [number, number];
};

const normalizeSelectionRect = (start: { x: number; y: number }, current: { x: number; y: number }) => ({
  left: Math.min(start.x, current.x),
  top: Math.min(start.y, current.y),
  right: Math.max(start.x, current.x),
  bottom: Math.max(start.y, current.y),
});

const pointInSelectionRect = (point: { x: number; y: number }, rect: ReturnType<typeof normalizeSelectionRect>) =>
  point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;

const pointInPolygon2D = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) => {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, prev = polygon.length - 1; index < polygon.length; prev = index, index += 1) {
    const a = polygon[index];
    const b = polygon[prev];
    const intersects =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / Math.max(b.y - a.y, Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
};

const buildFeatureLabel = (type: FeatureType, properties?: Record<string, any>, index?: number) => {
  if (type === "road") return String(properties?.name || `Road ${typeof index === "number" ? index + 1 : ""}`).trim();
  if (type === "building") return `Building ${typeof index === "number" ? index + 1 : ""}`.trim();
  if (type === "river") return `River ${typeof index === "number" ? index + 1 : ""}`.trim();
  return `Fence ${typeof index === "number" ? index + 1 : ""}`.trim();
};

const toolForFeatureType = (type: FeatureType): EditorTool => (type === "building" ? "draw_polygon" : "draw_line_string");

const layerIds: Record<FeatureType | "boundary", string[]> = {
  road: ["roads-line"],
  building: ["buildings-fill", "buildings-line"],
  river: ["rivers-line"],
  fence: ["fences-line"],
  boundary: ["plot-boundary-line"],
};

const EMPTY_EDITOR_STYLE: mapboxgl.Style = {
  version: 8,
  name: "landcheck-cad-editor",
  sources: {},
  layers: [
    {
      id: "cad-background",
      type: "background",
      paint: {
        "background-color": "#030712",
        "background-opacity": 1,
      },
    },
  ],
};

const SATELLITE_EDITOR_STYLE: mapboxgl.Style = {
  version: 8,
  name: "landcheck-cad-editor-satellite",
  sources: {
    "mapbox-satellite": {
      type: "raster",
      url: "mapbox://mapbox.satellite",
      tileSize: 256,
    } as any,
  },
  layers: [
    {
      id: "satellite-raster",
      type: "raster",
      source: "mapbox-satellite",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

export default function FeatureOverrideModal({
  isOpen,
  onClose,
  onSave,
  plotCoords,
  featureType,
  setFeatureType,
  action,
  setAction,
  roadName,
  setRoadName,
  roadWidth,
  setRoadWidth,
  plotId,
}: Props) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const plottingStageRef = useRef<HTMLDivElement>(null);
  const activeDrawFeatureId = useRef<string | null>(null);
  const plottingPanRef = useRef<{ active: boolean; lastX: number; lastY: number; moved: boolean }>({
    active: false,
    lastX: 0,
    lastY: 0,
    moved: false,
  });

  const [menu, setMenu] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [selectedGeometry, setSelectedGeometry] = useState<any>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<GeometryMetrics | null>(null);
  const [draftMetrics, setDraftMetrics] = useState<GeometryMetrics | null>(null);
  const [cursor, setCursor] = useState<{ lng: number; lat: number } | null>(null);
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("satellite");
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(DEFAULT_LAYER_VISIBILITY);
  const [featureInventory, setFeatureInventory] = useState<FeatureInventory>(DEFAULT_INVENTORY);
  const [featureCollections, setFeatureCollections] = useState<FeatureCollectionState>(DEFAULT_FEATURE_COLLECTIONS);
  const [plottingPoints, setPlottingPoints] = useState<number[][]>([]);
  const [deleteConfirmArmed, setDeleteConfirmArmed] = useState(false);
  const [plottingCamera, setPlottingCamera] = useState<PlottingCamera>(DEFAULT_PLOTTING_CAMERA);
  const [plottingPanActive, setPlottingPanActive] = useState(false);
  const [selectedFeatureRecord, setSelectedFeatureRecord] = useState<FeatureRecord | null>(null);
  const [draftingAssist, setDraftingAssist] = useState<DraftingAssistState>(DEFAULT_DRAFTING_ASSIST);
  const [plottingHoverPoint, setPlottingHoverPoint] = useState<number[] | null>(null);
  const [plottingSnapLabel, setPlottingSnapLabel] = useState<string | null>(null);
  const [osnapModes, setOsnapModes] = useState<OsnapModes>(DEFAULT_OSNAP_MODES);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [selectionDrag, setSelectionDrag] = useState<SelectionDrag>(null);
  const [multiSelectedKeys, setMultiSelectedKeys] = useState<string[]>([]);
  const [commandInput, setCommandInput] = useState("");
  const [commandMessages, setCommandMessages] = useState<string[]>([
    "Type HELP for editor commands. Use BOX or LASSO to multi-select in plotting view.",
  ]);

  const activeMetrics = useMemo(() => draftMetrics || selectedMetrics, [draftMetrics, selectedMetrics]);
  const plottingDraftGeometry = useMemo(
    () => buildGeometryFromPoints(plottingPoints, activeTool),
    [activeTool, plottingPoints]
  );
  const plottingViewport = useMemo(
    () =>
      buildPlottingViewport({
        plotCoords,
        featureCollections,
        selectedGeometry,
        draftGeometry: plottingDraftGeometry,
    }),
    [featureCollections, plotCoords, plottingDraftGeometry, selectedGeometry]
  );
  const plottingZoomPercent = useMemo(() => `${Math.round(plottingCamera.zoom * 100)}%`, [plottingCamera.zoom]);
  const plottingPreviewPoints = useMemo(() => {
    if (basemapMode !== "plotting" || activeTool === "select" || !plottingHoverPoint) return plottingPoints;
    return [...plottingPoints, plottingHoverPoint];
  }, [activeTool, basemapMode, plottingHoverPoint, plottingPoints]);
  const plottingPreviewGeometry = useMemo(
    () => (plottingPreviewPoints.length > plottingPoints.length ? buildGeometryFromPoints(plottingPreviewPoints, activeTool) : null),
    [activeTool, plottingPoints.length, plottingPreviewPoints]
  );
  const hasSelectedGeometry = Boolean(selectedGeometry);
  const hasDraftGeometry =
    Boolean(plottingDraftGeometry) ||
    Boolean(drawRef.current?.getAll()?.features?.length);
  const objectRecords = useMemo<FeatureRecord[]>(() => {
    const records: FeatureRecord[] = [];
    (Object.entries(featureCollections) as Array<[FeatureType, FeatureCollectionState[FeatureType]]>).forEach(([type, collection]) => {
      collection?.features?.forEach((feature: any, index: number) => {
        const properties = (feature?.properties || {}) as Record<string, any>;
        const geometry = feature?.geometry;
        records.push({
          key: `${type}-${index}`,
          type,
          label: buildFeatureLabel(type, properties, index),
          properties,
          geometry,
          metrics: getGeometryMetrics(geometry),
          coordinates: geometryToCoordinateList(geometry),
        });
      });
    });
    return records;
  }, [featureCollections]);
  const visibleObjectRecords = useMemo(
    () => objectRecords.filter((record) => layerVisibility[record.type]),
    [layerVisibility, objectRecords]
  );
  const selectedCoordinateRows = useMemo(
    () => geometryToCoordinateList(selectedGeometry).slice(0, 8),
    [selectedGeometry]
  );
  const multiSelectedRecords = useMemo(
    () => objectRecords.filter((record) => multiSelectedKeys.includes(record.key)),
    [multiSelectedKeys, objectRecords]
  );
  const selectedObjectCount = multiSelectedKeys.length;
  const snapCandidates = useMemo(() => {
    const seen = new Set<string>();
    const candidates: Array<{ coord: number[]; label: string }> = [];
    const pushCandidate = (coord: number[] | null | undefined, label: string) => {
      if (!Array.isArray(coord) || coord.length < 2) return;
      const key = `${Number(coord[0]).toFixed(7)}:${Number(coord[1]).toFixed(7)}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ coord: [Number(coord[0]), Number(coord[1])], label });
    };
    const visibleRecords = objectRecords.filter((record) => layerVisibility[record.type]);
    const segmentSets: Array<{ label: string; segments: Array<{ start: number[]; end: number[] }> }> = [];
    if (osnapModes.endpoint && plotCoords?.length) {
      plotCoords.forEach((coord, index) => pushCandidate(coord, `Boundary ${index + 1}`));
    }
    if (osnapModes.endpoint && plotCoords?.length) {
      segmentSets.push({
        label: "Boundary",
        segments: getGeometrySegments({ type: "Polygon", coordinates: [plotCoords] }),
      });
    }
    visibleRecords.forEach((record) => {
      const segments = getGeometrySegments(record.geometry);
      segmentSets.push({ label: record.label, segments });
      if (osnapModes.endpoint) {
        record.coordinates.forEach((coord, index) => pushCandidate(coord, `${record.label} · end ${index + 1}`));
      }
      if (osnapModes.midpoint) {
        segments.forEach((segment, index) => {
          pushCandidate(midpointCoordinate(segment.start, segment.end), `${record.label} · mid ${index + 1}`);
        });
      }
    });
    if (osnapModes.midpoint && plotCoords?.length) {
      getGeometrySegments({ type: "Polygon", coordinates: [plotCoords] }).forEach((segment, index) => {
        pushCandidate(midpointCoordinate(segment.start, segment.end), `Boundary · mid ${index + 1}`);
      });
    }
    if (osnapModes.intersection) {
      const allSegments = segmentSets.flatMap((set) =>
        set.segments.map((segment) => ({ ...segment, label: set.label }))
      );
      for (let index = 0; index < allSegments.length; index += 1) {
        for (let next = index + 1; next < allSegments.length; next += 1) {
          const intersection = getSegmentIntersection(
            allSegments[index].start,
            allSegments[index].end,
            allSegments[next].start,
            allSegments[next].end
          );
          if (!intersection) continue;
          pushCandidate(intersection, `${allSegments[index].label} x ${allSegments[next].label}`);
        }
      }
    }
    return candidates;
  }, [layerVisibility, objectRecords, osnapModes.endpoint, osnapModes.intersection, osnapModes.midpoint, plotCoords]);
  const plottingMeasureSummary = useMemo(() => {
    if (!draftingAssist.measure || activeTool === "select" || !plottingHoverPoint || !plottingPoints.length) return null;
    const segment = lineLengthMeters([plottingPoints[plottingPoints.length - 1], plottingHoverPoint]);
    const totalLine = lineLengthMeters(plottingPreviewPoints);
    const totalArea =
      activeTool === "draw_polygon" && plottingPreviewPoints.length >= 3
        ? polygonAreaSqm([closeRing(plottingPreviewPoints)])
        : 0;
    const last = plottingViewport.project(plottingPoints[plottingPoints.length - 1]);
    const hover = plottingViewport.project(plottingHoverPoint);
    return {
      segment,
      totalLine,
      totalArea,
      labelX: (last.x + hover.x) / 2,
      labelY: (last.y + hover.y) / 2 - 12,
    };
  }, [activeTool, draftingAssist.measure, plottingHoverPoint, plottingPoints, plottingPreviewPoints, plottingViewport]);

  const isStyleReady = useCallback((map: mapboxgl.Map | null) => {
    if (!map) return false;
    try {
      return map.isStyleLoaded();
    } catch {
      return false;
    }
  }, []);

  const importGeometryIntoEditor = useCallback(
    (geometry: any, nextFeatureType: FeatureType, properties?: Record<string, any>, descriptor?: Partial<FeatureRecord>) => {
      if (!geometry) return;

      setSelectedGeometry(geometry);
      setSelectedMetrics(getGeometryMetrics(geometry));
      setDraftMetrics(getGeometryMetrics(geometry));
      setFeatureType(nextFeatureType);
      setSelectedFeatureRecord(
        descriptor?.key || descriptor?.label
          ? {
              key: descriptor.key || `${nextFeatureType}-selection`,
              type: nextFeatureType,
              label: descriptor.label || buildFeatureLabel(nextFeatureType, properties),
              properties: properties || {},
              geometry,
              metrics: getGeometryMetrics(geometry),
              coordinates: geometryToCoordinateList(geometry),
            }
          : {
              key: `${nextFeatureType}-selection`,
              type: nextFeatureType,
              label: buildFeatureLabel(nextFeatureType, properties),
              properties: properties || {},
              geometry,
              metrics: getGeometryMetrics(geometry),
              coordinates: geometryToCoordinateList(geometry),
            }
      );
      setMultiSelectedKeys(descriptor?.key ? [descriptor.key] : []);
      setPlottingHoverPoint(null);
      setPlottingSnapLabel(null);

      if (nextFeatureType === "road") {
        const nextName = typeof properties?.name === "string" ? String(properties.name) : "";
        const nextWidth = String(properties?.width_m || "");
        setRoadName(nextName);
        if (nextWidth && ["2", "4", "6", "8", "10", "12", "15", "20", "30"].includes(nextWidth)) {
          setRoadWidth(nextWidth as Props["roadWidth"]);
        }
      }

      if (action === "add") {
        setAction("update");
      }

      if (geometry.type === "LineString") {
        setPlottingPoints(Array.isArray(geometry.coordinates) ? geometry.coordinates.map((point: number[]) => [point[0], point[1]]) : []);
      } else if (geometry.type === "Polygon") {
        const ring = Array.isArray(geometry.coordinates?.[0]) ? geometry.coordinates[0] : [];
        setPlottingPoints(ring.slice(0, -1).map((point: number[]) => [point[0], point[1]]));
      } else {
        setPlottingPoints([]);
      }

      if (basemapMode === "satellite" && drawRef.current) {
        drawRef.current.deleteAll();
        const added = drawRef.current.add({
          type: "Feature",
          properties: { imported_from_detection: true },
          geometry,
        } as any);
        const nextId = Array.isArray(added) ? added[0] : added;
        activeDrawFeatureId.current = nextId ? String(nextId) : null;
        if (nextId) {
          try {
            drawRef.current.changeMode("direct_select", { featureId: String(nextId) } as any);
          } catch {
            drawRef.current.changeMode("simple_select");
          }
        }
      }
    },
    [action, basemapMode, setAction, setFeatureType, setRoadName, setRoadWidth]
  );

  const applyBasemapMode = useCallback((map: mapboxgl.Map, mode: BasemapMode) => {
    if (!isStyleReady(map)) return;
    const plotting = mode === "plotting";

    if (map.getLayer("cad-mask-fill")) {
      map.setPaintProperty("cad-mask-fill", "fill-opacity", 0);
    }
    if (map.getLayer("cad-grid-major")) {
      map.setLayoutProperty("cad-grid-major", "visibility", plotting ? "visible" : "none");
    }
    if (map.getLayer("cad-grid-minor")) {
      map.setLayoutProperty("cad-grid-minor", "visibility", plotting ? "visible" : "none");
    }
    if (map.getLayer("plot-boundary-line")) {
      map.setPaintProperty("plot-boundary-line", "line-color", plotting ? "#f8fafc" : "#f97316");
      map.setPaintProperty("plot-boundary-line", "line-width", plotting ? 2.6 : 2.2);
      map.setPaintProperty("plot-boundary-line", "line-dasharray", plotting ? [0.8, 0.6] : [1.4, 1.2]);
    }
    if (map.getLayer("roads-line")) {
      map.setPaintProperty("roads-line", "line-color", plotting ? "#7dd3fc" : "#fde047");
      map.setPaintProperty("roads-line", "line-width", plotting ? 2.4 : 3);
      map.setPaintProperty("roads-line", "line-opacity", plotting ? 1 : 0.95);
    }
    if (map.getLayer("buildings-fill")) {
      map.setPaintProperty("buildings-fill", "fill-color", plotting ? "#38bdf8" : "#38bdf8");
      map.setPaintProperty("buildings-fill", "fill-opacity", plotting ? 0.08 : 0.2);
    }
    if (map.getLayer("buildings-line")) {
      map.setPaintProperty("buildings-line", "line-color", plotting ? "#e0f2fe" : "#bae6fd");
      map.setPaintProperty("buildings-line", "line-width", plotting ? 1.8 : 2);
    }
    if (map.getLayer("rivers-line")) {
      map.setPaintProperty("rivers-line", "line-color", plotting ? "#38bdf8" : "#60a5fa");
      map.setPaintProperty("rivers-line", "line-width", plotting ? 2.2 : 2.5);
    }
    if (map.getLayer("fences-line")) {
      map.setPaintProperty("fences-line", "line-color", plotting ? "#fda4af" : "#fca5a5");
      map.setPaintProperty("fences-line", "line-width", plotting ? 1.8 : 2);
    }
  }, [isStyleReady]);

  const ensureCadOverlay = useCallback((map: mapboxgl.Map) => {
    if (!isStyleReady(map)) return;
    const beforeId = map
      .getStyle()
      ?.layers?.find((layer) => String(layer.id || "").startsWith("gl-draw"))?.id;
    const overlay = buildCadOverlayData(plotCoords);

    if (!map.getSource("cad-mask-src")) {
      map.addSource("cad-mask-src", { type: "geojson", data: overlay.mask as any });
      map.addLayer(
        {
          id: "cad-mask-fill",
          type: "fill",
          source: "cad-mask-src",
          paint: {
            "fill-color": "#040811",
            "fill-opacity": 0,
          },
        },
        beforeId
      );
    } else {
      (map.getSource("cad-mask-src") as mapboxgl.GeoJSONSource).setData(overlay.mask as any);
    }

    if (!map.getSource("cad-grid-src")) {
      map.addSource("cad-grid-src", { type: "geojson", data: overlay.grid as any });
      map.addLayer(
        {
          id: "cad-grid-minor",
          type: "line",
          source: "cad-grid-src",
          filter: ["==", ["get", "kind"], "minor"],
          layout: { visibility: "none" },
          paint: {
            "line-color": "#1e293b",
            "line-width": 1,
            "line-opacity": 0.8,
          },
        },
        beforeId
      );
      map.addLayer(
        {
          id: "cad-grid-major",
          type: "line",
          source: "cad-grid-src",
          filter: ["==", ["get", "kind"], "major"],
          layout: { visibility: "none" },
          paint: {
            "line-color": "#334155",
            "line-width": 1.3,
            "line-opacity": 0.96,
          },
        },
        beforeId
      );
    } else {
      (map.getSource("cad-grid-src") as mapboxgl.GeoJSONSource).setData(overlay.grid as any);
    }
  }, [isStyleReady, plotCoords]);

  const applyLayerVisibility = useCallback((map: mapboxgl.Map, state: LayerVisibility) => {
    if (!isStyleReady(map)) return;
    (Object.keys(layerIds) as Array<keyof typeof layerIds>).forEach((key) => {
      const visible = state[key];
      layerIds[key].forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
        }
      });
    });
  }, [isStyleReady]);

  const syncMapFeatureSources = useCallback(
    (map: mapboxgl.Map, collections: FeatureCollectionState) => {
      if (!isStyleReady(map)) return;

      const roadsData = collections.road || EMPTY_FEATURE_COLLECTION;
      const buildingsData = collections.building || EMPTY_FEATURE_COLLECTION;
      const riversData = collections.river || EMPTY_FEATURE_COLLECTION;
      const fencesData = collections.fence || EMPTY_FEATURE_COLLECTION;

      if (!map.getSource("roads-src")) {
        map.addSource("roads-src", { type: "geojson", data: roadsData as any });
        map.addLayer({
          id: "roads-line",
          type: "line",
          source: "roads-src",
          paint: { "line-color": "#fde047", "line-width": 3, "line-opacity": 0.95 },
        });
      } else {
        (map.getSource("roads-src") as mapboxgl.GeoJSONSource).setData(roadsData as any);
      }

      if (!map.getSource("buildings-src")) {
        map.addSource("buildings-src", { type: "geojson", data: buildingsData as any });
        map.addLayer({
          id: "buildings-fill",
          type: "fill",
          source: "buildings-src",
          paint: { "fill-color": "#38bdf8", "fill-opacity": 0.2 },
        });
        map.addLayer({
          id: "buildings-line",
          type: "line",
          source: "buildings-src",
          paint: { "line-color": "#bae6fd", "line-width": 2 },
        });
      } else {
        (map.getSource("buildings-src") as mapboxgl.GeoJSONSource).setData(buildingsData as any);
      }

      if (!map.getSource("rivers-src")) {
        map.addSource("rivers-src", { type: "geojson", data: riversData as any });
        map.addLayer({
          id: "rivers-line",
          type: "line",
          source: "rivers-src",
          paint: { "line-color": "#60a5fa", "line-width": 2.5, "line-opacity": 0.95 },
        });
      } else {
        (map.getSource("rivers-src") as mapboxgl.GeoJSONSource).setData(riversData as any);
      }

      if (!map.getSource("fences-src")) {
        map.addSource("fences-src", { type: "geojson", data: fencesData as any });
        map.addLayer({
          id: "fences-line",
          type: "line",
          source: "fences-src",
          paint: {
            "line-color": "#fca5a5",
            "line-width": 2,
            "line-dasharray": [2, 1.4],
          },
        });
      } else {
        (map.getSource("fences-src") as mapboxgl.GeoJSONSource).setData(fencesData as any);
      }

      applyLayerVisibility(map, layerVisibility);
      applyBasemapMode(map, basemapMode);
    },
    [applyBasemapMode, applyLayerVisibility, basemapMode, isStyleReady, layerVisibility]
  );

  const fitPlotBoundary = useCallback(() => {
    if (basemapMode === "plotting") {
      setPlottingCamera(DEFAULT_PLOTTING_CAMERA);
      return;
    }
    const map = mapRef.current;
    if (!map || !plotCoords?.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    plotCoords.forEach(([lng, lat]) => bounds.extend([lng, lat]));
    map.fitBounds(bounds, { padding: 48, duration: 300 });
  }, [basemapMode, plotCoords]);

  const syncDraftFromDraw = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    const data = draw.getAll();
    const feature = data.features[data.features.length - 1];
    const geometry = feature?.geometry || null;
    setDraftMetrics(getGeometryMetrics(geometry));
    activeDrawFeatureId.current = feature?.id ? String(feature.id) : null;
  }, []);

  const setEditorTool = useCallback((tool: EditorTool) => {
    if (basemapMode === "plotting") {
      setActiveTool(tool);
      if (tool === "select") {
        setPlottingPoints([]);
      }
      return;
    }
    const draw = drawRef.current;
    if (!draw) {
      setActiveTool(tool);
      return;
    }
    if (tool === "select") {
      draw.changeMode("simple_select");
    } else {
      draw.changeMode(tool as any);
    }
    setActiveTool(tool);
  }, [basemapMode]);

  const clearWorkingSelection = useCallback(() => {
    drawRef.current?.deleteAll();
    activeDrawFeatureId.current = null;
    setPlottingPoints([]);
    setPlottingHoverPoint(null);
    setPlottingSnapLabel(null);
    setDraftMetrics(null);
    setSelectedGeometry(null);
    setSelectedFeatureRecord(null);
    setMultiSelectedKeys([]);
    setSelectionDrag(null);
    setSelectedMetrics(null);
    setDeleteConfirmArmed(false);
    setActiveTool("select");
    drawRef.current?.changeMode("simple_select");
  }, []);

  const startAddFlow = useCallback(() => {
    setDeleteConfirmArmed(false);
    setAction("add");
    drawRef.current?.deleteAll();
    activeDrawFeatureId.current = null;
    setSelectedGeometry(null);
    setSelectedFeatureRecord(null);
    setMultiSelectedKeys([]);
    setSelectedMetrics(null);
    setDraftMetrics(null);
    setPlottingPoints([]);
    setPlottingHoverPoint(null);
    setPlottingSnapLabel(null);
    setEditorTool(toolForFeatureType(featureType));
  }, [featureType, setAction, setEditorTool]);

  const startUpdateFlow = useCallback(() => {
    setDeleteConfirmArmed(false);
    if (!selectedGeometry) {
      toast("Select a detected feature first, then modify it.");
      return;
    }
    setAction("update");
    setEditorTool("select");
  }, [selectedGeometry, setAction, setEditorTool]);

  const startDeleteFlow = useCallback(() => {
    setDeleteConfirmArmed(false);
    if (!selectedGeometry) {
      toast("Select the feature you want to remove first.");
      return;
    }
    setAction("delete");
    setEditorTool("select");
  }, [selectedGeometry, setAction, setEditorTool]);

  const activeCommandLabel =
    action === "delete"
      ? "Delete selected feature"
      : action === "update"
        ? "Modify selected feature"
        : "Add new feature";

  const editorPrompt =
    action === "delete"
      ? hasSelectedGeometry
        ? deleteConfirmArmed
          ? "Delete is armed. Review the selected feature, then confirm delete."
          : "Delete mode is ready. Review the selected feature, then confirm delete."
        : "Select an existing feature to remove."
      : action === "update"
        ? hasSelectedGeometry
          ? "Selected feature is ready for editing. Adjust geometry, then apply changes."
          : "Select an existing feature to modify."
        : `Choose the ${toolForFeatureType(featureType) === "draw_polygon" ? "polygon" : "line"} tool and draw a new ${featureType}.`;

  const primaryActionLabel =
    action === "delete"
      ? deleteConfirmArmed
        ? "Confirm Delete"
        : "Delete Selected Feature"
      : action === "update"
        ? "Apply Changes"
        : "Add Feature";

  const canSave =
    action === "delete"
      ? hasSelectedGeometry
      : action === "update"
        ? hasSelectedGeometry
        : hasDraftGeometry || hasSelectedGeometry;

  useEffect(() => {
    setDeleteConfirmArmed(false);
  }, [action, selectedGeometry, featureType]);

  useEffect(() => {
    if (!isOpen || !plotId) return;

    let cancelled = false;

    const loadFeatures = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/plots/${plotId}/features/geojson`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const nextCollections: FeatureCollectionState = {
          road: data.roads || EMPTY_FEATURE_COLLECTION,
          building: data.buildings || EMPTY_FEATURE_COLLECTION,
          river: data.rivers || EMPTY_FEATURE_COLLECTION,
          fence: data.fences || EMPTY_FEATURE_COLLECTION,
        };

        setFeatureCollections(nextCollections);
        setFeatureInventory({
          road: Array.isArray(nextCollections.road.features) ? nextCollections.road.features.length : 0,
          building: Array.isArray(nextCollections.building.features) ? nextCollections.building.features.length : 0,
          river: Array.isArray(nextCollections.river.features) ? nextCollections.river.features.length : 0,
          fence: Array.isArray(nextCollections.fence.features) ? nextCollections.fence.features.length : 0,
        });

        if (mapRef.current) {
          syncMapFeatureSources(mapRef.current, nextCollections);
        }
      } catch {
        if (!cancelled) {
          setFeatureCollections(DEFAULT_FEATURE_COLLECTIONS);
          setFeatureInventory(DEFAULT_INVENTORY);
        }
      }
    };

    loadFeatures();

    return () => {
      cancelled = true;
    };
  }, [isOpen, plotId, syncMapFeatureSources]);

  useEffect(() => {
    if (!isOpen || basemapMode !== "satellite" || mapRef.current || !containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: basemapMode === "satellite" ? SATELLITE_EDITOR_STYLE : EMPTY_EDITOR_STYLE,
      center: [7.5, 9.0],
      zoom: 12,
      pitchWithRotate: false,
      dragRotate: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: "simple_select",
    });
    map.addControl(draw);

    const selectFeature = (nextFeatureType: FeatureType) => (event: mapboxgl.MapLayerMouseEvent) => {
      if (!drawRef.current || !event.features?.length) return;
      const sourceFeature = event.features[0];
      if (!sourceFeature.geometry) return;
      setActiveTool("select");
      importGeometryIntoEditor(sourceFeature.geometry, nextFeatureType, sourceFeature.properties as Record<string, any>);
    };

    const contextMenu = (nextFeatureType: FeatureType) => (event: mapboxgl.MapLayerMouseEvent) => {
      event.preventDefault();
      if (!event.features?.length) return;
      selectFeature(nextFeatureType)(event);
      setMenu({ x: event.originalEvent.clientX, y: event.originalEvent.clientY, visible: true });
    };

    map.on("load", () => {
      ensureCadOverlay(map);
      if (plotCoords && plotCoords.length >= 3) {
        const plotFeature = {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [plotCoords],
          },
        };
        if (!map.getSource("plot-boundary")) {
          map.addSource("plot-boundary", {
            type: "geojson",
            data: plotFeature as any,
          });
          map.addLayer({
            id: "plot-boundary-line",
            type: "line",
            source: "plot-boundary",
            paint: {
              "line-color": "#f97316",
              "line-width": 2.2,
              "line-dasharray": [1.4, 1.2],
            },
          });
        }
        fitPlotBoundary();
      }

      syncMapFeatureSources(map, featureCollections);
      applyBasemapMode(map, basemapMode);
    });

    map.on("draw.create", syncDraftFromDraw);
    map.on("draw.update", syncDraftFromDraw);
    map.on("draw.delete", () => {
      activeDrawFeatureId.current = null;
      setDraftMetrics(null);
      if (action === "add") {
        setSelectedGeometry(null);
        setSelectedMetrics(null);
      }
    });
    map.on("draw.selectionchange", syncDraftFromDraw);
    map.on("draw.modechange", (event: any) => {
      const nextMode = String(event?.mode || "simple_select");
      if (nextMode === "draw_line_string" || nextMode === "draw_polygon") {
        setActiveTool(nextMode);
      } else {
        setActiveTool("select");
      }
    });

    map.on("mousemove", (event) => {
      setCursor({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    });
    map.on("mouseleave", () => setCursor(null));

    const interactiveBindings: Array<[string, FeatureType]> = [
      ["roads-line", "road"],
      ["buildings-fill", "building"],
      ["buildings-line", "building"],
      ["rivers-line", "river"],
      ["fences-line", "fence"],
    ];

    interactiveBindings.forEach(([layerId, nextFeatureType]) => {
      map.on("click", layerId, selectFeature(nextFeatureType));
      map.on("contextmenu", layerId, contextMenu(nextFeatureType));
      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "crosshair";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;
    drawRef.current = draw;

    return () => {
      activeDrawFeatureId.current = null;
      drawRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [action, applyBasemapMode, basemapMode, ensureCadOverlay, featureCollections, fitPlotBoundary, importGeometryIntoEditor, isOpen, plotCoords, syncMapFeatureSources, syncDraftFromDraw]);

  useEffect(() => {
    if (!isOpen || basemapMode !== "satellite") return;
    const map = mapRef.current;
    if (!map) return;
    applyLayerVisibility(map, layerVisibility);
  }, [applyLayerVisibility, basemapMode, isOpen, layerVisibility]);

  useEffect(() => {
    if (!isOpen || basemapMode !== "satellite") return;
    const map = mapRef.current;
    if (!map) return;
    ensureCadOverlay(map);
    applyBasemapMode(map, basemapMode);
  }, [applyBasemapMode, basemapMode, ensureCadOverlay, isOpen]);

  useEffect(() => {
    if (!isOpen || basemapMode !== "plotting") return;
    setDraftMetrics(getGeometryMetrics(plottingDraftGeometry));
  }, [basemapMode, isOpen, plottingDraftGeometry]);

  useEffect(() => {
    if (!isOpen || basemapMode !== "plotting") return;
    setPlottingCamera(DEFAULT_PLOTTING_CAMERA);
  }, [basemapMode, isOpen]);

  useEffect(() => {
    if (activeTool === "select" || basemapMode !== "plotting") {
      setPlottingHoverPoint(null);
      setPlottingSnapLabel(null);
    }
  }, [activeTool, basemapMode]);

  useEffect(() => {
    if (!isOpen || basemapMode !== "satellite") return;
    if (!plottingDraftGeometry || !drawRef.current) return;
    drawRef.current.deleteAll();
    const added = drawRef.current.add({
      type: "Feature",
      properties: { imported_from_plotting: true },
      geometry: plottingDraftGeometry,
    } as any);
    const nextId = Array.isArray(added) ? added[0] : added;
    activeDrawFeatureId.current = nextId ? String(nextId) : null;
    setDraftMetrics(getGeometryMetrics(plottingDraftGeometry));
  }, [basemapMode, isOpen, plottingDraftGeometry]);

  const getPlottingPointer = useCallback(
    (target: SVGSVGElement, clientX: number, clientY: number) => {
      const rect = target.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * plottingViewport.width;
      const y = ((clientY - rect.top) / Math.max(rect.height, 1)) * plottingViewport.height;
      return { x, y };
    },
    [plottingViewport.height, plottingViewport.width]
  );

  const plottingScreenToCanvasPoint = useCallback(
    (point: { x: number; y: number }) => ({
      x: (point.x - plottingCamera.offsetX) / plottingCamera.zoom,
      y: (point.y - plottingCamera.offsetY) / plottingCamera.zoom,
    }),
    [plottingCamera.offsetX, plottingCamera.offsetY, plottingCamera.zoom]
  );

  const applyOrthoConstraint = useCallback(
    (canvasPoint: { x: number; y: number }) => {
      if (!draftingAssist.ortho || activeTool === "select" || !plottingPoints.length) return canvasPoint;
      const anchor = plottingViewport.project(plottingPoints[plottingPoints.length - 1]);
      const deltaX = canvasPoint.x - anchor.x;
      const deltaY = canvasPoint.y - anchor.y;
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        return { x: canvasPoint.x, y: anchor.y };
      }
      return { x: anchor.x, y: canvasPoint.y };
    },
    [activeTool, draftingAssist.ortho, plottingPoints, plottingViewport]
  );

  const applySnapConstraint = useCallback(
    (canvasPoint: { x: number; y: number }): { point: { x: number; y: number }; label: string | null } => {
      if (!draftingAssist.snap) return { point: canvasPoint, label: null as string | null };
      let nearestDistance = Number.POSITIVE_INFINITY;
      let snappedPoint = canvasPoint;
      let snappedLabel: string | null = null;
      snapCandidates.forEach((candidate) => {
        const projected = plottingViewport.project(candidate.coord);
        const distance = Math.hypot(projected.x - canvasPoint.x, projected.y - canvasPoint.y);
        if (distance > 14) return;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          snappedPoint = projected;
          snappedLabel = candidate.label;
        }
      });
      return { point: snappedPoint, label: snappedLabel };
    },
    [draftingAssist.snap, plottingViewport, snapCandidates]
  );

  const resolvePlottingCanvasPoint = useCallback(
    (rawCanvasPoint: { x: number; y: number }) => {
      const orthoPoint = applyOrthoConstraint(rawCanvasPoint);
      return applySnapConstraint(orthoPoint);
    },
    [applyOrthoConstraint, applySnapConstraint]
  );

  const handlePlottingMouseMove = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      if (basemapMode !== "plotting") return;
      const rawPointer = getPlottingPointer(event.currentTarget, event.clientX, event.clientY);
      if (plottingPanRef.current.active) {
        const deltaX = rawPointer.x - plottingPanRef.current.lastX;
        const deltaY = rawPointer.y - plottingPanRef.current.lastY;
        plottingPanRef.current.lastX = rawPointer.x;
        plottingPanRef.current.lastY = rawPointer.y;
        if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
          plottingPanRef.current.moved = true;
          setPlottingCamera((previous) => ({
            ...previous,
            offsetX: previous.offsetX + deltaX,
            offsetY: previous.offsetY + deltaY,
          }));
        }
        return;
      }
      if (selectionDrag?.mode === "box") {
        setSelectionDrag({ ...selectionDrag, current: rawPointer });
        return;
      }
      if (selectionDrag?.mode === "lasso") {
        const points = selectionDrag.points;
        const last = points[points.length - 1];
        if (!last || Math.hypot(rawPointer.x - last.x, rawPointer.y - last.y) >= 8) {
          setSelectionDrag({
            mode: "lasso",
            points: [...points, rawPointer],
          });
        }
        return;
      }
      const { point: pointer, label } = resolvePlottingCanvasPoint(plottingScreenToCanvasPoint(rawPointer));
      const [lng, lat] = plottingViewport.unproject(pointer);
      setCursor({ lng, lat });
      setPlottingSnapLabel(label);
      if (activeTool !== "select") {
        setPlottingHoverPoint([lng, lat]);
      }
    },
    [activeTool, basemapMode, getPlottingPointer, plottingScreenToCanvasPoint, plottingViewport, resolvePlottingCanvasPoint, selectionDrag]
  );

  const handlePlottingCanvasClick = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      if (basemapMode !== "plotting") return;
      if (activeTool === "select") return;
      if (plottingPanRef.current.moved) {
        plottingPanRef.current.moved = false;
        return;
      }
      if (selectionMode) return;
      event.preventDefault();
      const { point: pointer, label } = resolvePlottingCanvasPoint(
        getPlottingPointer(event.currentTarget, event.clientX, event.clientY)
      );
      const [lng, lat] = plottingViewport.unproject(pointer);
      setPlottingPoints((previous) => [...previous, [lng, lat]]);
      setPlottingHoverPoint([lng, lat]);
      setPlottingSnapLabel(label);
    },
    [activeTool, basemapMode, getPlottingPointer, plottingScreenToCanvasPoint, plottingViewport, resolvePlottingCanvasPoint, selectionMode]
  );

  const handlePlottingCanvasDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      if (basemapMode !== "plotting") return;
      if (activeTool === "select") return;
      event.preventDefault();
      const geometry = buildGeometryFromPoints(plottingPoints, activeTool);
      if (!geometry) return;
      setSelectedGeometry(geometry);
      setSelectedMetrics(getGeometryMetrics(geometry));
      setDraftMetrics(getGeometryMetrics(geometry));
      setActiveTool("select");
    },
    [activeTool, basemapMode, plottingPoints]
  );

  const handlePlottingFeatureSelect = useCallback(
    (nextFeatureType: FeatureType, feature: any, descriptor?: Partial<FeatureRecord>) => {
      importGeometryIntoEditor(feature?.geometry, nextFeatureType, feature?.properties || {}, descriptor);
      setActiveTool("select");
    },
    [importGeometryIntoEditor]
  );

  const handleObjectRecordSelect = useCallback(
    (record: FeatureRecord) => {
      importGeometryIntoEditor(record.geometry, record.type, record.properties, record);
      setActiveTool("select");
    },
    [importGeometryIntoEditor]
  );

  const handleObjectRecordClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, record: FeatureRecord) => {
      if (event.ctrlKey || event.metaKey) {
        setMultiSelectedKeys((previous) =>
          previous.includes(record.key)
            ? previous.filter((key) => key !== record.key)
            : [...previous, record.key]
        );
        if (!selectedFeatureRecord) {
          importGeometryIntoEditor(record.geometry, record.type, record.properties, record);
        }
        return;
      }
      handleObjectRecordSelect(record);
    },
    [handleObjectRecordSelect, importGeometryIntoEditor, selectedFeatureRecord]
  );

  const toggleDraftingAssist = useCallback((key: keyof DraftingAssistState) => {
    setDraftingAssist((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const toggleOsnapMode = useCallback((key: keyof OsnapModes) => {
    setOsnapModes((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const activateSelectionMode = useCallback((mode: SelectionMode) => {
    setSelectionMode((previous) => (previous === mode ? null : mode));
    setActiveTool("select");
    setPlottingPoints([]);
    setPlottingHoverPoint(null);
    setSelectionDrag(null);
  }, []);

  const resolveSelectionKeysFromShape = useCallback(
    (shape: SelectionDrag) => {
      if (!shape) return [];
      return visibleObjectRecords
        .filter((record) => {
          const projectedPoints = record.coordinates.map((coord) => plottingViewport.project(coord));
          if (shape.mode === "box") {
            const rect = normalizeSelectionRect(shape.start, shape.current);
            return projectedPoints.some((point) => pointInSelectionRect(point, rect));
          }
          return projectedPoints.some((point) => pointInPolygon2D(point, shape.points));
        })
        .map((record) => record.key);
    },
    [plottingViewport, visibleObjectRecords]
  );

  const handlePlottingMouseDown = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      if (basemapMode !== "plotting") return;
      const pointer = getPlottingPointer(event.currentTarget, event.clientX, event.clientY);
      if (event.button === 1) {
        event.preventDefault();
        plottingPanRef.current = {
          active: true,
          lastX: pointer.x,
          lastY: pointer.y,
          moved: false,
        };
        setPlottingPanActive(true);
        return;
      }
      if (event.button !== 0) return;
      if (selectionMode) {
        event.preventDefault();
        setSelectionDrag(
          selectionMode === "box"
            ? { mode: "box", start: pointer, current: pointer }
            : { mode: "lasso", points: [pointer] }
        );
      }
    },
    [basemapMode, getPlottingPointer, selectionMode]
  );

  const handlePlottingMouseUp = useCallback(
    (event?: ReactMouseEvent<SVGSVGElement>) => {
      if (selectionDrag) {
        const nextKeys = resolveSelectionKeysFromShape(selectionDrag);
        setMultiSelectedKeys(nextKeys);
        if (nextKeys.length === 1) {
          const record = objectRecords.find((item) => item.key === nextKeys[0]);
          if (record) {
            importGeometryIntoEditor(record.geometry, record.type, record.properties, record);
          }
        } else if (nextKeys.length > 1) {
          const primaryRecord = objectRecords.find((item) => item.key === nextKeys[0]);
          if (primaryRecord) {
            importGeometryIntoEditor(primaryRecord.geometry, primaryRecord.type, primaryRecord.properties, primaryRecord);
            setMultiSelectedKeys(nextKeys);
          }
        }
        setSelectionDrag(null);
        if (event) {
          event.preventDefault();
        }
        return;
      }
      if (!plottingPanRef.current.active) return;
      plottingPanRef.current.active = false;
      setPlottingPanActive(false);
      if (event) {
        event.preventDefault();
      }
    },
    [importGeometryIntoEditor, objectRecords, resolveSelectionKeysFromShape, selectionDrag]
  );

  const handlePlottingWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      if (basemapMode !== "plotting") return;
      event.preventDefault();
      const rawPointer = getPlottingPointer(event.currentTarget, event.clientX, event.clientY);
      setPlottingCamera((previous) => {
        const nextZoom = Math.min(4, Math.max(0.55, previous.zoom * (event.deltaY > 0 ? 0.92 : 1.08)));
        if (Math.abs(nextZoom - previous.zoom) < 0.0001) return previous;
        const worldX = (rawPointer.x - previous.offsetX) / previous.zoom;
        const worldY = (rawPointer.y - previous.offsetY) / previous.zoom;
        return {
          zoom: nextZoom,
          offsetX: rawPointer.x - worldX * nextZoom,
          offsetY: rawPointer.y - worldY * nextZoom,
        };
      });
    },
    [basemapMode, getPlottingPointer]
  );

  const handlePlottingMouseLeave = useCallback(() => {
    plottingPanRef.current.active = false;
    plottingPanRef.current.moved = false;
    setPlottingPanActive(false);
    setCursor(null);
    setPlottingHoverPoint(null);
    setPlottingSnapLabel(null);
    setSelectionDrag(null);
  }, []);

  const zoomPlottingCamera = useCallback((direction: "in" | "out") => {
    setPlottingCamera((previous) => {
      const factor = direction === "in" ? 1.12 : 0.9;
      const nextZoom = Math.min(4, Math.max(0.55, previous.zoom * factor));
      if (Math.abs(nextZoom - previous.zoom) < 0.0001) return previous;
      const anchorX = plottingViewport.width / 2;
      const anchorY = plottingViewport.height / 2;
      const worldX = (anchorX - previous.offsetX) / previous.zoom;
      const worldY = (anchorY - previous.offsetY) / previous.zoom;
      return {
        zoom: nextZoom,
        offsetX: anchorX - worldX * nextZoom,
        offsetY: anchorY - worldY * nextZoom,
      };
    });
  }, [plottingViewport.height, plottingViewport.width]);

  const pushCommandMessage = useCallback((message: string) => {
    setCommandMessages((previous) => [...previous.slice(-7), message]);
  }, []);

  const runCadCommand = useCallback(
    (rawInput: string) => {
      const normalized = rawInput.trim().toLowerCase();
      if (!normalized) return;
      const compact = normalized.replace(/\s+/g, " ");

      if (compact === "help") {
        pushCommandMessage("Commands: SELECT, LINE, POLYGON, BOX, LASSO, ROAD, BUILDING, RIVER, FENCE, ADD, MODIFY, DELETE, FIT, ZOOM IN, ZOOM OUT, SNAP ON/OFF, ORTHO ON/OFF, MEASURE ON/OFF, OSNAP ENDPOINT/MIDPOINT/INTERSECTION, SATELLITE, PLOTTING, CLEAR.");
        return;
      }
      if (compact === "select") {
        setActiveTool("select");
        setSelectionMode(null);
        pushCommandMessage("Select tool active.");
        return;
      }
      if (compact === "line") {
        setEditorTool("draw_line_string");
        setSelectionMode(null);
        pushCommandMessage("Line tool active.");
        return;
      }
      if (compact === "polygon") {
        setEditorTool("draw_polygon");
        setSelectionMode(null);
        pushCommandMessage("Polygon tool active.");
        return;
      }
      if (compact === "box") {
        activateSelectionMode("box");
        pushCommandMessage("Box selection armed.");
        return;
      }
      if (compact === "lasso") {
        activateSelectionMode("lasso");
        pushCommandMessage("Lasso selection armed.");
        return;
      }
      if (compact === "add") {
        startAddFlow();
        pushCommandMessage("Add command active.");
        return;
      }
      if (compact === "modify") {
        startUpdateFlow();
        pushCommandMessage("Modify command active.");
        return;
      }
      if (compact === "delete") {
        startDeleteFlow();
        pushCommandMessage("Delete command active.");
        return;
      }
      if (compact === "road" || compact === "building" || compact === "river" || compact === "fence") {
        setFeatureType(compact as FeatureType);
        pushCommandMessage(`Feature type set to ${compact}.`);
        return;
      }
      if (compact === "fit") {
        fitPlotBoundary();
        pushCommandMessage("View fit to plot.");
        return;
      }
      if (compact === "zoom in") {
        zoomPlottingCamera("in");
        pushCommandMessage("Plotting zoom increased.");
        return;
      }
      if (compact === "zoom out") {
        zoomPlottingCamera("out");
        pushCommandMessage("Plotting zoom reduced.");
        return;
      }
      if (compact === "satellite" || compact === "plotting") {
        setBasemapMode(compact as BasemapMode);
        pushCommandMessage(`Basemap switched to ${compact}.`);
        return;
      }
      if (compact === "clear") {
        clearWorkingSelection();
        pushCommandMessage("Working selection cleared.");
        return;
      }
      if (compact.startsWith("snap ")) {
        const value = compact.split(" ")[1];
        if (value === "on" || value === "off") {
          setDraftingAssist((previous) => ({ ...previous, snap: value === "on" }));
          pushCommandMessage(`Snap ${value}.`);
          return;
        }
      }
      if (compact.startsWith("ortho ")) {
        const value = compact.split(" ")[1];
        if (value === "on" || value === "off") {
          setDraftingAssist((previous) => ({ ...previous, ortho: value === "on" }));
          pushCommandMessage(`Ortho ${value}.`);
          return;
        }
      }
      if (compact.startsWith("measure ")) {
        const value = compact.split(" ")[1];
        if (value === "on" || value === "off") {
          setDraftingAssist((previous) => ({ ...previous, measure: value === "on" }));
          pushCommandMessage(`Measure ${value}.`);
          return;
        }
      }
      if (compact.startsWith("osnap ")) {
        const mode = compact.split(" ")[1];
        if (mode === "endpoint" || mode === "midpoint" || mode === "intersection") {
          toggleOsnapMode(mode as keyof OsnapModes);
          pushCommandMessage(`OSNAP ${mode} toggled.`);
          return;
        }
      }
      pushCommandMessage(`Unknown command: ${rawInput.trim()}`);
    },
    [
      activateSelectionMode,
      clearWorkingSelection,
      fitPlotBoundary,
      pushCommandMessage,
      setEditorTool,
      startAddFlow,
      startDeleteFlow,
      startUpdateFlow,
      toggleOsnapMode,
      zoomPlottingCamera,
    ]
  );

  const handleCommandSubmit = useCallback(() => {
    const next = commandInput.trim();
    if (!next) return;
    runCadCommand(next);
    setCommandInput("");
  }, [commandInput, runCadCommand]);

  const handleCommandKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      handleCommandSubmit();
    },
    [handleCommandSubmit]
  );

  const plottingGridLines = useMemo(() => {
    const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; major: boolean }> = [];
    const majorEvery = 5;
    let index = 0;
    const startX = Math.floor(plottingViewport.minX / plottingViewport.gridStepMeters) * plottingViewport.gridStepMeters;
    for (let x = startX; x <= plottingViewport.maxX + plottingViewport.gridStepMeters; x += plottingViewport.gridStepMeters) {
      const screenX = PLOTTING_VIEWPORT_PADDING + (x - plottingViewport.minX) * plottingViewport.scale;
      lines.push({
        key: `x-${x}`,
        x1: screenX,
        y1: PLOTTING_VIEWPORT_PADDING / 2,
        x2: screenX,
        y2: plottingViewport.height - PLOTTING_VIEWPORT_PADDING / 2,
        major: index % majorEvery === 0,
      });
      index += 1;
    }
    index = 0;
    const startY = Math.floor(plottingViewport.minY / plottingViewport.gridStepMeters) * plottingViewport.gridStepMeters;
    for (let y = startY; y <= plottingViewport.maxY + plottingViewport.gridStepMeters; y += plottingViewport.gridStepMeters) {
      const screenY = plottingViewport.height - PLOTTING_VIEWPORT_PADDING - (y - plottingViewport.minY) * plottingViewport.scale;
      lines.push({
        key: `y-${y}`,
        x1: PLOTTING_VIEWPORT_PADDING / 2,
        y1: screenY,
        x2: plottingViewport.width - PLOTTING_VIEWPORT_PADDING / 2,
        y2: screenY,
        major: index % majorEvery === 0,
      });
      index += 1;
    }
    return lines;
  }, [plottingViewport]);

  const handleSave = () => {
    if (action === "delete") {
      if (!selectedGeometry) {
        toast.error("Select the feature you want to remove first.");
        return;
      }
      if (!deleteConfirmArmed) {
        setDeleteConfirmArmed(true);
        toast("Delete armed. Click confirm again to remove the selected feature.");
        return;
      }
      onSave({
        feature_type: featureType,
        action: "delete",
        geojson: selectedGeometry,
      });
      return;
    }

    if (action === "update" && !selectedGeometry) {
      toast.error("Select a feature first, then apply the update.");
      return;
    }

    const draw = drawRef.current;
    const data = draw?.getAll();
    let feature = data?.features?.[data.features.length - 1];
    if (!feature && plottingDraftGeometry) {
      feature = {
        type: "Feature",
        properties: {},
        geometry: plottingDraftGeometry,
      } as any;
    }
    if (!feature && selectedGeometry) {
      feature = {
        type: "Feature",
        properties: {},
        geometry: selectedGeometry,
      } as any;
    }
    if (!feature) {
      toast.error(action === "add" ? "Draw the new feature first." : "No geometry is ready to save.");
      return;
    }
    onSave({
      feature_type: featureType,
      action,
      name: featureType === "road" ? roadName : undefined,
      width_m: featureType === "road" ? Number(roadWidth) : undefined,
      geojson: feature.geometry,
    });
  };

  const suggestedTool = toolForFeatureType(featureType);
  const suggestedToolLabel = suggestedTool === "draw_polygon" ? "Polygon tool" : "Line tool";

  if (!isOpen) return null;

  return (
    <div className="feature-override-modal">
      <div className="feature-override-card cad-editor-card">
        <div className="feature-override-header cad-editor-header">
          <div>
            <p className="feature-override-kicker">Survey Plan Drafting Workspace</p>
            <h3>Feature CAD Editor</h3>
            <p>Use the drafting tools to add, update, or remove detected roads, buildings, rivers, and fences.</p>
          </div>
          <button className="feature-override-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="cad-editor-toolbar">
          <div className="cad-toolbar-group">
            <span className="cad-toolbar-label">Tools</span>
            <button
              type="button"
              className={`cad-tool-btn ${activeTool === "select" ? "active" : ""}`}
              onClick={() => {
                setEditorTool("select");
                setSelectionMode(null);
              }}
            >
              Select
            </button>
            <button
              type="button"
              className={`cad-tool-btn ${selectionMode === "box" ? "active" : ""}`}
              onClick={() => activateSelectionMode("box")}
            >
              Box
            </button>
            <button
              type="button"
              className={`cad-tool-btn ${selectionMode === "lasso" ? "active" : ""}`}
              onClick={() => activateSelectionMode("lasso")}
            >
              Lasso
            </button>
            <button
              type="button"
              className={`cad-tool-btn ${activeTool === "draw_line_string" ? "active" : ""}`}
              onClick={() => {
                setSelectionMode(null);
                setEditorTool("draw_line_string");
              }}
            >
              Line
            </button>
            <button
              type="button"
              className={`cad-tool-btn ${activeTool === "draw_polygon" ? "active" : ""}`}
              onClick={() => {
                setSelectionMode(null);
                setEditorTool("draw_polygon");
              }}
            >
              Polygon
            </button>
            <button
              type="button"
              className="cad-tool-btn"
              onClick={() => {
                setSelectionMode(null);
                setEditorTool(suggestedTool);
              }}
            >
              Match {suggestedToolLabel}
            </button>
          </div>

          <div className="cad-toolbar-group">
            <span className="cad-toolbar-label">View</span>
            <button type="button" className="cad-tool-btn" onClick={fitPlotBoundary}>
              Fit Plot
            </button>
            {basemapMode === "plotting" ? (
              <>
                <button type="button" className="cad-tool-btn" onClick={() => zoomPlottingCamera("in")}>
                  Zoom In
                </button>
                <button type="button" className="cad-tool-btn" onClick={() => zoomPlottingCamera("out")}>
                  Zoom Out
                </button>
              </>
            ) : null}
            <button type="button" className="cad-tool-btn" onClick={clearWorkingSelection}>
              Clear Draft
            </button>
          </div>

          <div className="cad-toolbar-group">
            <span className="cad-toolbar-label">Command</span>
            <button
              type="button"
              className={`cad-tool-btn ${action === "add" ? "active" : ""}`}
              onClick={startAddFlow}
            >
              Add New
            </button>
            <button
              type="button"
              className={`cad-tool-btn ${action === "update" ? "active" : ""}`}
              onClick={startUpdateFlow}
            >
              Modify Selected
            </button>
            <button
              type="button"
              className={`cad-tool-btn danger ${action === "delete" ? "active" : ""}`}
              onClick={startDeleteFlow}
            >
              Delete Selected
            </button>
          </div>

          <div className="cad-toolbar-group">
            <span className="cad-toolbar-label">Basemap</span>
            <button
              type="button"
              className={`cad-tool-btn ${basemapMode === "satellite" ? "active" : ""}`}
              onClick={() => setBasemapMode("satellite")}
            >
              Satellite
            </button>
            <button
              type="button"
              className={`cad-tool-btn ${basemapMode === "plotting" ? "active" : ""}`}
              onClick={() => setBasemapMode("plotting")}
            >
              Plotting
            </button>
          </div>

          <div className="cad-toolbar-group cad-toolbar-group--hint">
            <span className="cad-toolbar-prompt">
              {activeCommandLabel}: <strong>{featureType}</strong>. {editorPrompt}
            </span>
          </div>
        </div>

        <div className="cad-editor-body">
          <aside className="cad-editor-sidebar">
            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Feature Setup</strong>
                <span>Type and properties for the active command</span>
              </div>
              <div className="feature-override-controls cad-form-grid">
                <div className="field">
                  <label>Feature Type</label>
                  <select value={featureType} onChange={(event) => setFeatureType(event.target.value as FeatureType)}>
                    <option value="road">Road</option>
                    <option value="building">Building</option>
                    <option value="river">River</option>
                    <option value="fence">Fence</option>
                  </select>
                </div>
                {featureType === "road" && action !== "delete" && (
                  <div className="field wide">
                    <label>Road Name</label>
                    <input value={roadName} onChange={(event) => setRoadName(event.target.value)} placeholder="e.g. Access Road A" />
                  </div>
                )}
                {featureType === "road" && action !== "delete" && (
                  <div className="field">
                    <label>Road Width (m)</label>
                    <select value={roadWidth} onChange={(event) => setRoadWidth(event.target.value as Props["roadWidth"])}>
                      <option value="2">2</option>
                      <option value="4">4</option>
                      <option value="6">6</option>
                      <option value="8">8</option>
                      <option value="10">10</option>
                      <option value="12">12</option>
                      <option value="15">15</option>
                      <option value="20">20</option>
                      <option value="30">30</option>
                    </select>
                  </div>
                )}
                <div className="hint">
                  Roads, rivers, and fences use line drafting. Buildings use polygon drafting. Select existing features first for modify or delete. Right-click only changes command state; it does not delete immediately.
                </div>
              </div>
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Objects</strong>
                <span>Click an item to highlight and edit it on the canvas</span>
              </div>
              <div className="cad-object-list">
                {visibleObjectRecords.length ? (
                  visibleObjectRecords.map((record) => (
                    <button
                      type="button"
                      key={record.key}
                      className={`cad-object-item${multiSelectedKeys.includes(record.key) || selectedFeatureRecord?.key === record.key ? " active" : ""}`}
                      onClick={(event) => handleObjectRecordClick(event, record)}
                    >
                      <span className="cad-object-item-main">
                        <strong>{record.label}</strong>
                        <small>{record.metrics ? `${record.metrics.geometryType} · ${record.metrics.vertices} pts` : record.type}</small>
                      </span>
                      <span className={`cad-object-type cad-object-type--${record.type}`}>{record.type}</span>
                    </button>
                  ))
                ) : (
                  <p className="cad-empty-state">No visible detected objects in the current layer filter.</p>
                )}
              </div>
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Layers</strong>
                <span>Toggle drafting references</span>
              </div>
              <div className="cad-layer-list">
                {([
                  ["boundary", "Plot boundary", null],
                  ["road", "Roads", featureInventory.road],
                  ["building", "Buildings", featureInventory.building],
                  ["river", "Rivers", featureInventory.river],
                  ["fence", "Fences", featureInventory.fence],
                ] as Array<[keyof LayerVisibility, string, number | null]>).map(([key, label, count]) => (
                  <label key={key} className="cad-layer-toggle">
                    <input
                      type="checkbox"
                      checked={layerVisibility[key]}
                      onChange={(event) =>
                        setLayerVisibility((previous) => ({
                          ...previous,
                          [key]: event.target.checked,
                        }))
                      }
                    />
                    <span>{label}</span>
                    {typeof count === "number" ? <em>{count}</em> : <em>ref</em>}
                  </label>
                ))}
              </div>
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Drafting Notes</strong>
                <span>Practical workflow</span>
              </div>
              <ul className="cad-note-list">
                <li>Use <strong>Match {suggestedToolLabel}</strong> to jump to the correct geometry tool for the current feature type.</li>
                <li>Click a detected feature to import it into the editor for update.</li>
                <li>Use line drafting for delete masks on roads, rivers, and fences; use polygon drafting for building deletes.</li>
                <li>Save commits the current geometry back into your existing feature override endpoint.</li>
              </ul>
            </section>
          </aside>

          <div className={`cad-editor-canvas cad-editor-canvas--${basemapMode}`}>
            <div className="cad-canvas-head">
              <div>
                <strong>Drafting Canvas</strong>
                <span>
                  {basemapMode === "plotting"
                    ? "Dark plotting view with CAD grid and parcel drafting overlays"
                    : "Satellite context with editable feature geometry"}
                </span>
              </div>
              <div className="cad-canvas-badges">
                <span className="cad-badge cad-badge--ghost">{basemapMode}</span>
                <span className="cad-badge">{featureType}</span>
                <span className="cad-badge cad-badge--ghost">{action}</span>
                {selectionMode ? <span className="cad-badge cad-badge--ghost">{selectionMode} select</span> : null}
              </div>
            </div>
            {basemapMode === "plotting" ? (
              <div className="feature-override-map cad-plotting-stage" ref={plottingStageRef}>
                <div className="cad-plotting-help">
                  Wheel to zoom. Hold middle mouse and drag to pan.
                  {selectionMode ? ` ${selectionMode === "box" ? "Drag a window to select multiple objects." : "Trace a lasso to select multiple objects."}` : ""}
                </div>
                <svg
                  className={`cad-plotting-svg${plottingPanActive ? " is-panning" : ""}`}
                  viewBox={`0 0 ${plottingViewport.width} ${plottingViewport.height}`}
                  onMouseMove={handlePlottingMouseMove}
                  onMouseDown={handlePlottingMouseDown}
                  onMouseUp={handlePlottingMouseUp}
                  onMouseLeave={handlePlottingMouseLeave}
                  onWheel={handlePlottingWheel}
                  onClick={handlePlottingCanvasClick}
                  onDoubleClick={handlePlottingCanvasDoubleClick}
                  onAuxClick={(event) => event.preventDefault()}
                >
                  <rect x="0" y="0" width={plottingViewport.width} height={plottingViewport.height} className="cad-plot-bg" />
                  <g transform={`translate(${plottingCamera.offsetX.toFixed(2)} ${plottingCamera.offsetY.toFixed(2)}) scale(${plottingCamera.zoom.toFixed(3)})`}>
                    {plottingGridLines.map((line) => (
                      <line
                        key={line.key}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        className={line.major ? "cad-grid-line cad-grid-line--major" : "cad-grid-line cad-grid-line--minor"}
                      />
                    ))}
                    {layerVisibility.boundary && plotCoords?.length ? (
                      <polygon
                        points={pointsToSvg(closeRing(plotCoords), plottingViewport.project)}
                        className="cad-svg-boundary"
                      />
                    ) : null}
                    {layerVisibility.road &&
                      featureCollections.road.features.map((feature, index) => {
                        const geometry = feature?.geometry;
                        if (geometry?.type !== "LineString") return null;
                        const labelPoint = getFeatureLabelPoint(geometry, plottingViewport.project);
                        const descriptor = objectRecords.find((record) => record.key === `road-${index}`);
                        const isMultiSelected = descriptor ? multiSelectedKeys.includes(descriptor.key) : false;
                        return (
                          <g key={`road-${index}`} onClick={() => handlePlottingFeatureSelect("road", feature, descriptor || undefined)}>
                            <polyline
                              points={pointsToSvg(geometry.coordinates || [], plottingViewport.project)}
                              className="cad-svg-feature cad-svg-feature--road"
                            />
                            {isMultiSelected ? (
                              <polyline
                                points={pointsToSvg(geometry.coordinates || [], plottingViewport.project)}
                                className="cad-svg-multiselect"
                              />
                            ) : null}
                            {labelPoint ? (
                              <text x={labelPoint.x + 8} y={labelPoint.y - 8} className="cad-svg-label">
                                {feature?.properties?.name || `Road ${index + 1}`}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                    {layerVisibility.river &&
                      featureCollections.river.features.map((feature, index) => {
                        const geometry = feature?.geometry;
                        if (geometry?.type !== "LineString") return null;
                        const descriptor = objectRecords.find((record) => record.key === `river-${index}`);
                        const isMultiSelected = descriptor ? multiSelectedKeys.includes(descriptor.key) : false;
                        return (
                          <g key={`river-${index}`} onClick={() => handlePlottingFeatureSelect("river", feature, descriptor || undefined)}>
                            <polyline
                              points={pointsToSvg(geometry.coordinates || [], plottingViewport.project)}
                              className="cad-svg-feature cad-svg-feature--river"
                            />
                            {isMultiSelected ? (
                              <polyline
                                points={pointsToSvg(geometry.coordinates || [], plottingViewport.project)}
                                className="cad-svg-multiselect"
                              />
                            ) : null}
                          </g>
                        );
                      })}
                    {layerVisibility.fence &&
                      featureCollections.fence.features.map((feature, index) => {
                        const geometry = feature?.geometry;
                        if (geometry?.type !== "LineString") return null;
                        const descriptor = objectRecords.find((record) => record.key === `fence-${index}`);
                        const isMultiSelected = descriptor ? multiSelectedKeys.includes(descriptor.key) : false;
                        return (
                          <g key={`fence-${index}`} onClick={() => handlePlottingFeatureSelect("fence", feature, descriptor || undefined)}>
                            <polyline
                              points={pointsToSvg(geometry.coordinates || [], plottingViewport.project)}
                              className="cad-svg-feature cad-svg-feature--fence"
                            />
                            {isMultiSelected ? (
                              <polyline
                                points={pointsToSvg(geometry.coordinates || [], plottingViewport.project)}
                                className="cad-svg-multiselect"
                              />
                            ) : null}
                          </g>
                        );
                      })}
                    {layerVisibility.building &&
                      featureCollections.building.features.map((feature, index) => {
                        const geometry = feature?.geometry;
                        const ring = Array.isArray(geometry?.coordinates?.[0]) ? geometry.coordinates[0] : null;
                        if (!ring) return null;
                        const labelPoint = getFeatureLabelPoint(geometry, plottingViewport.project);
                        const descriptor = objectRecords.find((record) => record.key === `building-${index}`);
                        const isMultiSelected = descriptor ? multiSelectedKeys.includes(descriptor.key) : false;
                        return (
                          <g key={`building-${index}`} onClick={() => handlePlottingFeatureSelect("building", feature, descriptor || undefined)}>
                            <polygon
                              points={pointsToSvg(ring, plottingViewport.project)}
                              className="cad-svg-feature cad-svg-feature--building"
                            />
                            {isMultiSelected ? (
                              <polygon
                                points={pointsToSvg(ring, plottingViewport.project)}
                                className="cad-svg-multiselect"
                              />
                            ) : null}
                            {labelPoint ? (
                              <text x={labelPoint.x + 8} y={labelPoint.y - 8} className="cad-svg-label">
                                BLD-{index + 1}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                    {selectedGeometry?.type === "LineString" ? (
                      <polyline
                        points={pointsToSvg(selectedGeometry.coordinates || [], plottingViewport.project)}
                        className="cad-svg-selected"
                      />
                    ) : null}
                    {selectedGeometry?.type === "Polygon" && Array.isArray(selectedGeometry.coordinates?.[0]) ? (
                      <polygon
                        points={pointsToSvg(selectedGeometry.coordinates[0], plottingViewport.project)}
                        className="cad-svg-selected"
                      />
                    ) : null}
                    {plottingDraftGeometry?.type === "LineString" ? (
                      <polyline
                        points={pointsToSvg((plottingDraftGeometry.coordinates || []) as number[][], plottingViewport.project)}
                        className="cad-svg-draft"
                      />
                    ) : null}
                    {plottingDraftGeometry?.type === "Polygon" && Array.isArray(plottingDraftGeometry.coordinates?.[0]) ? (
                      <polygon
                        points={pointsToSvg(plottingDraftGeometry.coordinates[0] as number[][], plottingViewport.project)}
                        className="cad-svg-draft cad-svg-draft--polygon"
                      />
                    ) : null}
                    {plottingPoints.map((point, index) => {
                      const projected = plottingViewport.project(point);
                      return <circle key={`pt-${index}`} cx={projected.x} cy={projected.y} r="4.5" className="cad-svg-vertex" />;
                    })}
                    {plottingPreviewGeometry?.type === "LineString" && draftingAssist.measure ? (
                      <polyline
                        points={pointsToSvg((plottingPreviewGeometry.coordinates || []) as number[][], plottingViewport.project)}
                        className="cad-svg-preview"
                      />
                    ) : null}
                    {plottingPreviewGeometry?.type === "Polygon" && Array.isArray(plottingPreviewGeometry.coordinates?.[0]) && draftingAssist.measure ? (
                      <polygon
                        points={pointsToSvg(plottingPreviewGeometry.coordinates[0] as number[][], plottingViewport.project)}
                        className="cad-svg-preview cad-svg-preview--polygon"
                      />
                    ) : null}
                    {plottingMeasureSummary && draftingAssist.measure ? (
                      <g className="cad-measure-callout">
                        <rect
                          x={plottingMeasureSummary.labelX - 58}
                          y={plottingMeasureSummary.labelY - 18}
                          width="116"
                          height="24"
                          rx="12"
                          className="cad-measure-box"
                        />
                        <text x={plottingMeasureSummary.labelX} y={plottingMeasureSummary.labelY - 2} textAnchor="middle" className="cad-measure-label">
                          {formatLength(plottingMeasureSummary.segment)}
                        </text>
                      </g>
                    ) : null}
                  </g>
                  {selectionDrag?.mode === "box" ? (
                    <rect
                      x={normalizeSelectionRect(selectionDrag.start, selectionDrag.current).left}
                      y={normalizeSelectionRect(selectionDrag.start, selectionDrag.current).top}
                      width={normalizeSelectionRect(selectionDrag.start, selectionDrag.current).right - normalizeSelectionRect(selectionDrag.start, selectionDrag.current).left}
                      height={normalizeSelectionRect(selectionDrag.start, selectionDrag.current).bottom - normalizeSelectionRect(selectionDrag.start, selectionDrag.current).top}
                      className="cad-selection-box"
                    />
                  ) : null}
                  {selectionDrag?.mode === "lasso" && selectionDrag.points.length > 1 ? (
                    <polyline
                      points={selectionDrag.points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")}
                      className="cad-selection-lasso"
                    />
                  ) : null}
                  <line
                    x1={PLOTTING_VIEWPORT_PADDING / 2}
                    y1={plottingViewport.height - PLOTTING_VIEWPORT_PADDING / 2}
                    x2={PLOTTING_VIEWPORT_PADDING / 2 + 80}
                    y2={plottingViewport.height - PLOTTING_VIEWPORT_PADDING / 2}
                    className="cad-axis-line"
                  />
                  <line
                    x1={PLOTTING_VIEWPORT_PADDING / 2}
                    y1={plottingViewport.height - PLOTTING_VIEWPORT_PADDING / 2}
                    x2={PLOTTING_VIEWPORT_PADDING / 2}
                    y2={plottingViewport.height - PLOTTING_VIEWPORT_PADDING / 2 - 80}
                    className="cad-axis-line"
                  />
                  <text x={PLOTTING_VIEWPORT_PADDING / 2 + 86} y={plottingViewport.height - PLOTTING_VIEWPORT_PADDING / 2 + 4} className="cad-axis-label">
                    X
                  </text>
                  <text x={PLOTTING_VIEWPORT_PADDING / 2 - 6} y={plottingViewport.height - PLOTTING_VIEWPORT_PADDING / 2 - 90} className="cad-axis-label">
                    Y
                  </text>
                </svg>
              </div>
            ) : (
              <div
                key={basemapMode}
                className={`feature-override-map cad-drafting-map cad-drafting-map--${basemapMode}`}
                ref={containerRef}
              />
            )}
            <div className="cad-status-bar">
              <span>
                Cursor:{" "}
                {cursor ? `${cursor.lng.toFixed(6)}, ${cursor.lat.toFixed(6)}` : "--"}
              </span>
              <span>Basemap: {basemapMode === "plotting" ? "Plotting" : "Satellite"}</span>
              <span>Tool: {activeTool === "select" ? "Select" : activeTool === "draw_polygon" ? "Polygon" : "Line"}</span>
              {basemapMode === "plotting" ? <span>Zoom: {plottingZoomPercent}</span> : null}
              {basemapMode === "plotting" ? <span>Grid: On</span> : null}
              <button type="button" className={`cad-status-toggle${draftingAssist.snap ? " active" : ""}`} onClick={() => toggleDraftingAssist("snap")}>
                Snap {draftingAssist.snap ? "On" : "Off"}
              </button>
              <button type="button" className={`cad-status-toggle${draftingAssist.ortho ? " active" : ""}`} onClick={() => toggleDraftingAssist("ortho")}>
                Ortho {draftingAssist.ortho ? "On" : "Off"}
              </button>
              <button type="button" className={`cad-status-toggle${draftingAssist.measure ? " active" : ""}`} onClick={() => toggleDraftingAssist("measure")}>
                Measure {draftingAssist.measure ? "On" : "Off"}
              </button>
              {basemapMode === "plotting" && plottingSnapLabel ? <span>Snap Target: {plottingSnapLabel}</span> : null}
              {basemapMode === "plotting" ? <span>OSNAP: {`${osnapModes.endpoint ? "End " : ""}${osnapModes.midpoint ? "Mid " : ""}${osnapModes.intersection ? "Int" : ""}`.trim() || "Off"}</span> : null}
              {basemapMode === "plotting" ? <span>Pan: Middle mouse drag</span> : null}
              {basemapMode === "plotting" && plottingMeasureSummary ? (
                <span>Segment: {formatLength(plottingMeasureSummary.segment)}</span>
              ) : null}
              <span>
                Geometry:{" "}
                {activeMetrics
                  ? `${activeMetrics.geometryType} | ${activeMetrics.vertices} pts | ${formatLength(activeMetrics.lengthM || activeMetrics.perimeterM)}`
                  : "None"}
              </span>
            </div>
          </div>

          <aside className="cad-editor-inspector">
            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Properties</strong>
                <span>
                  {selectedObjectCount > 1
                    ? `${selectedObjectCount} objects selected`
                    : selectedFeatureRecord
                      ? "Selected feature metadata"
                      : "No selected feature"}
                </span>
              </div>
              {selectedObjectCount > 1 ? (
                <div className="cad-selection-summary">
                  <strong>Multi-selection active</strong>
                  <span>
                    {selectedObjectCount} objects are selected. Modify and delete still act on the active target only.
                  </span>
                </div>
              ) : null}
              {selectedFeatureRecord ? (
                <div className="cad-property-list">
                  <div className="cad-property-row">
                    <span>Label</span>
                    <strong>{selectedFeatureRecord.label}</strong>
                  </div>
                  <div className="cad-property-row">
                    <span>Feature</span>
                    <strong>{selectedFeatureRecord.type}</strong>
                  </div>
                  <div className="cad-property-row">
                    <span>Command</span>
                    <strong>{activeCommandLabel}</strong>
                  </div>
                  <div className="cad-property-row">
                    <span>Geometry</span>
                    <strong>{selectedFeatureRecord.metrics?.geometryType || "--"}</strong>
                  </div>
                  {selectedFeatureRecord.type === "road" ? (
                    <>
                      <div className="cad-property-row">
                        <span>Road name</span>
                        <strong>{roadName || "--"}</strong>
                      </div>
                      <div className="cad-property-row">
                        <span>Width</span>
                        <strong>{roadWidth} m</strong>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="cad-empty-state">Select an object from the list or canvas to inspect its properties.</p>
              )}
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Selected Geometry</strong>
                <span>{hasSelectedGeometry ? "Selection ready for command execution" : "Live drafting measurements"}</span>
              </div>
              {activeMetrics ? (
                <div className="cad-metrics-grid">
                  <div className="cad-metric">
                    <span>Type</span>
                    <strong>{activeMetrics.geometryType}</strong>
                  </div>
                  <div className="cad-metric">
                    <span>Vertices</span>
                    <strong>{activeMetrics.vertices}</strong>
                  </div>
                  <div className="cad-metric">
                    <span>Length</span>
                    <strong>{formatLength(activeMetrics.lengthM || activeMetrics.perimeterM)}</strong>
                  </div>
                  <div className="cad-metric">
                    <span>Area</span>
                    <strong>{formatArea(activeMetrics.areaSqm)}</strong>
                  </div>
                </div>
              ) : (
                <p className="cad-empty-state">Select a detected feature or start drawing to see live geometry measurements.</p>
              )}
              {hasSelectedGeometry ? (
                <div className="cad-selection-summary">
                  <strong>Selected target</strong>
                  <span>{featureType} selected. Use Modify Selected to adjust it or Delete Selected to remove it.</span>
                </div>
              ) : null}
              {selectedObjectCount > 1 ? (
                <div className="cad-selection-summary">
                  <strong>Selection set</strong>
                  <span>
                    {multiSelectedRecords.slice(0, 4).map((record) => record.label).join(", ")}
                    {selectedObjectCount > 4 ? ` +${selectedObjectCount - 4} more` : ""}
                  </span>
                </div>
              ) : null}
              {action === "delete" ? (
                <div className={`cad-warning${deleteConfirmArmed ? " armed" : ""}`}>
                  <strong>{deleteConfirmArmed ? "Delete confirmation required" : "Delete mode"}</strong>
                  <span>
                    {deleteConfirmArmed
                      ? "Confirm delete in the footer to commit removal of the selected feature."
                      : "Delete does not happen immediately. The selected feature must be confirmed before it is removed."}
                  </span>
                </div>
              ) : null}
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Coordinates</strong>
                <span>Active vertex list</span>
              </div>
              {selectedCoordinateRows.length ? (
                <div className="cad-coordinate-list">
                  {selectedCoordinateRows.map((coord, index) => (
                    <div className="cad-coordinate-row" key={`${coord[0]}-${coord[1]}-${index}`}>
                      <span>P{index + 1}</span>
                      <strong>{formatCoordinateValue(coord[0])}</strong>
                      <strong>{formatCoordinateValue(coord[1])}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="cad-empty-state">The selected geometry coordinates will appear here.</p>
              )}
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Object Snap</strong>
                <span>Endpoint, midpoint, and intersection controls</span>
              </div>
              <div className="cad-osnap-list">
                <button type="button" className={`cad-osnap-chip${osnapModes.endpoint ? " active" : ""}`} onClick={() => toggleOsnapMode("endpoint")}>
                  Endpoint
                </button>
                <button type="button" className={`cad-osnap-chip${osnapModes.midpoint ? " active" : ""}`} onClick={() => toggleOsnapMode("midpoint")}>
                  Midpoint
                </button>
                <button type="button" className={`cad-osnap-chip${osnapModes.intersection ? " active" : ""}`} onClick={() => toggleOsnapMode("intersection")}>
                  Intersection
                </button>
              </div>
            </section>
          </aside>
        </div>

        <div className="cad-command-strip">
          <div className="cad-command-log">
            {commandMessages[commandMessages.length - 1] || "Ready."}
          </div>
          <div className="cad-command-entry">
            <span className="cad-command-prompt">Command</span>
            <input
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              onKeyDown={handleCommandKeyDown}
              placeholder="Type HELP, BOX, LASSO, LINE, POLYGON, FIT..."
            />
            <button type="button" className="cad-tool-btn" onClick={handleCommandSubmit}>
              Run
            </button>
          </div>
        </div>

        <div className="feature-override-actions cad-editor-actions">
          <div className="cad-editor-actions-left">
            {action === "delete"
              ? deleteConfirmArmed
                ? "Delete is armed. Confirm to remove the selected feature."
                : "Delete requires an explicit confirmation before anything is removed."
              : action === "update"
                ? "Modify the selected feature, then apply the change."
                : "Draw a new feature, then apply it."}
          </div>
          <div className="cad-editor-actions-right">
            <button className="btn-outline" onClick={clearWorkingSelection}>
              Clear
            </button>
            <button className="btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button
              className={`btn-primary${action === "delete" ? " danger" : ""}`}
              onClick={handleSave}
              disabled={!canSave}
            >
              {primaryActionLabel}
            </button>
          </div>
        </div>
      </div>

      {menu.visible && (
        <div
          className="feature-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu((current) => ({ ...current, visible: false }))}
        >
          <button
            onClick={() => {
              startUpdateFlow();
              setMenu((current) => ({ ...current, visible: false }));
            }}
          >
            Modify Selected
          </button>
          <button
            onClick={() => {
              startDeleteFlow();
              setMenu((current) => ({ ...current, visible: false }));
            }}
          >
            Mark for Delete
          </button>
          <button
            onClick={() => {
              clearWorkingSelection();
              setMenu((current) => ({ ...current, visible: false }));
            }}
          >
            Clear Selection
          </button>
        </div>
      )}
    </div>
  );
}
