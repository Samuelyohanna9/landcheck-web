import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import toast from "react-hot-toast";
import "../styles/feature-override-modal.css";
import { fromWGS84 } from "../utils/coordinateConverter";
import CadIcon from "./CadIcon";
import { loadMapboxDraw, loadMapboxGl } from "../utils/mapboxLoader";

type FeatureType = "road" | "building" | "river" | "fence";
type EditableFeatureTarget = FeatureType | "boundary";
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

type CoordinateRowDisplay = {
  key: string;
  label: string;
  x: string;
  y: string;
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

type BeaconStyle = "circle" | "square" | "triangle" | "diamond" | "cross";
type NorthArrowColor = "black" | "blue";

type PendingSave =
  | { kind: "delete"; targets: FeatureRecord[] }
  | {
      kind: "upsert";
      featureType: FeatureType;
      action: "add" | "update";
      geometry: any;
      name?: string;
      width_m?: number;
      replacedKey?: string;
    };

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
};

type PlotMeta = {
  title_text: string;
  location_text: string;
  lga_text: string;
  state_text: string;
  surveyor_name: string;
  surveyor_rank: string;
  certification_statement: string;
  scale_text: string;
  paper_size: string;
  template_name: "general" | "site_plan" | "adamawa_osg" | "akwa_ibom_osg" | "rivers_osg" | "cross_river_osg" | "fct_abuja_osg";
  [key: string]: any;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: { feature_type: FeatureType; action: FeatureAction; name?: string; width_m?: number; geojson: any }) => Promise<boolean>;
  plotCoords: number[][] | null;
  featureType: FeatureType;
  setFeatureType: (t: FeatureType) => void;
  action: FeatureAction;
  setAction: (a: FeatureAction) => void;
  roadName: string;
  setRoadName: (v: string) => void;
  riverName: string;
  setRiverName: (v: string) => void;
  roadWidth: string;
  setRoadWidth: (v: string) => void;
  plotId: number | null;
  meta: PlotMeta;
  manualPoints: ManualPoint[];
  beaconStyle: BeaconStyle;
  northArrowColor: NorthArrowColor;
  coordinateSystem: string;
  onBoundaryPointChange?: (index: number, lngLat: [number, number]) => void;
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

const PLOTTING_VIEWPORT_PADDING = 30;
const PLOTTING_VIEWPORT_MARGIN = 16;
// AutoCAD-style deep zoom: a small parcel can sit inside a much larger fitted extent
// (roads, rivers spanning hundreds of metres), so the ceiling has to be high enough to
// let a user zoom past that extent and into just the parcel's own boundary detail.
const PLOTTING_ZOOM_MIN = 0.4;
const PLOTTING_ZOOM_MAX = 80;
const DEFAULT_PLOTTING_STAGE_SIZE = { width: 900, height: 700 };
const DEFAULT_PLOTTING_CAMERA: PlottingCamera = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

const CAD_EDITOR_HELP_SECTIONS = [
  {
    title: "Add features",
    description:
      "Choose a feature type first. Roads, rivers, and fences use the line tool. Buildings use the polygon tool. Boundary editing only activates when Boundary is selected.",
  },
  {
    title: "Modify or delete safely",
    description:
      "Select an existing object on the sheet or from the register, then use Modify or Delete. Boundary edits stay protected until you intentionally switch the feature type to Boundary.",
  },
  {
    title: "Work accurately",
    description:
      "Use Snap, Ortho, and Measure for cleaner drafting. Fit Plot recenters the parcel, while Box and Lasso help you review multiple objects quickly.",
  },
  {
    title: "Mobile workflow",
    description:
      "On smaller screens, keep the plot open and pull in Tools or Inspector only when needed. The drawing surface stays primary while you work.",
  },
] as const;

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

const ALL_COMMANDS = [
  "HELP",
  "LINE",
  "POLYGON",
  "SELECT",
  "BOX",
  "LASSO",
  "ADD",
  "MODIFY",
  "DELETE",
  "ROAD",
  "BUILDING",
  "RIVER",
  "FENCE",
  "FIT",
  "ZOOM IN",
  "ZOOM OUT",
  "SATELLITE",
  "PLOTTING",
  "CLEAR",
  "SNAP ON",
  "SNAP OFF",
  "ORTHO ON",
  "ORTHO OFF",
  "MEASURE ON",
  "MEASURE OFF",
  "OSNAP ENDPOINT",
  "OSNAP MIDPOINT",
  "OSNAP INTERSECTION",
  "UNDO"
];

const EARTH_RADIUS_M = 6371008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const getSegmentBearing = (p1: number[], p2: number[]) => {
  const [lng1, lat1] = p1;
  const [lng2, lat2] = p2;
  const dLng = toRadians(lng2 - lng1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  
  const deg = Math.floor(bearing);
  let min = Math.round((bearing - deg) * 60);
  let displayDeg = deg;
  if (min === 60) {
    min = 0;
    displayDeg = (displayDeg + 1) % 360;
  }
  return `${displayDeg}°${min.toString().padStart(2, "0")}'`;
};

const getCentroid = (coords: number[][], project: (coord: number[]) => { x: number; y: number }) => {
  if (!coords || !coords.length) return { x: 0, y: 0 };
  const avg = coords.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
    { lng: 0, lat: 0 }
  );
  return project([avg.lng / coords.length, avg.lat / coords.length]);
};

const getCoordinateSystemName = (sys: string) => {
  if (sys === "wgs84") return "WGS 84";
  if (sys === "utm_31n") return "WGS 84 UTM ZONE 31N";
  if (sys === "utm_32n") return "WGS 84 UTM ZONE 32N";
  if (sys === "utm_33n") return "WGS 84 UTM ZONE 33N";
  if (sys === "minna_31") return "MINNA UTM ZONE 31N";
  if (sys === "minna_32") return "MINNA UTM ZONE 32N";
  if (sys === "minna_33") return "MINNA UTM ZONE 33N";
  if (sys === "ghana_utm_30n") return "GHANA UTM ZONE 30N";
  if (sys === "ghana_leigon_grid") return "GHANA LEIGON GRID";
  if (sys === "uganda_utm_35n") return "UGANDA UTM ZONE 35N";
  if (sys === "uganda_utm_36n") return "UGANDA UTM ZONE 36N";
  if (sys === "uganda_arc1960_35n") return "UGANDA ARC 1960 ZONE 35N";
  if (sys === "uganda_arc1960_36n") return "UGANDA ARC 1960 ZONE 36N";
  return sys.toUpperCase();
};

const getCoordinateSystemCompactName = (sys: string) => {
  if (sys === "wgs84") return "WGS 84";
  if (sys === "utm_31n") return "UTM 31N";
  if (sys === "utm_32n") return "UTM 32N";
  if (sys === "utm_33n") return "UTM 33N";
  if (sys === "minna_31") return "Minna 31";
  if (sys === "minna_32") return "Minna 32";
  if (sys === "minna_33") return "Minna 33";
  if (sys === "ghana_utm_30n") return "Ghana UTM 30N";
  if (sys === "ghana_leigon_grid") return "Ghana Leigon";
  if (sys === "uganda_utm_35n") return "Uganda UTM 35N";
  if (sys === "uganda_utm_36n") return "Uganda UTM 36N";
  if (sys === "uganda_arc1960_35n") return "Uganda Arc60 35N";
  if (sys === "uganda_arc1960_36n") return "Uganda Arc60 36N";
  return sys.toUpperCase();
};

const getProjectedBounds = (coords: number[][], project: (coord: number[]) => { x: number; y: number }) => {
  const source = getOpenRing(coords);
  if (!source.length) return null;
  const projected = source.map((coord) => project(coord));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
};

const formatEditorCoordinateValue = (value: number, coordinateSystem: string) =>
  coordinateSystem === "wgs84" ? value.toFixed(6) : value.toFixed(2);

const getCoordinateAxisLabels = (coordinateSystem: string) =>
  coordinateSystem === "wgs84"
    ? { x: "Longitude", y: "Latitude", xShort: "Lon", yShort: "Lat", units: "" }
    : { x: "Easting", y: "Northing", xShort: "E", yShort: "N", units: " m" };

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

const getStationName = (index: number): string => {
  let name = "";
  let num = index;
  do {
    name = String.fromCharCode(65 + (num % 26)) + name;
    num = Math.floor(num / 26) - 1;
  } while (num >= 0);
  return name;
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
  viewportWidth: number;
  viewportHeight: number;
}) => {
  const coordinates: number[][] = [];
  const focusCoordinates: number[][] = [];
  if (Array.isArray(params.plotCoords)) {
    params.plotCoords.forEach((point) => {
      if (Array.isArray(point) && point.length >= 2) {
        const normalized: number[] = [Number(point[0]), Number(point[1])];
        coordinates.push(normalized);
        focusCoordinates.push(normalized);
      }
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

  const extentCoordinates = focusCoordinates.length ? focusCoordinates : coordinates;
  const avgLat = extentCoordinates.reduce((sum, [, lat]) => sum + lat, 0) / extentCoordinates.length;
  const cosLat = Math.max(Math.cos(toRadians(avgLat)), 0.2);
  const referenceLng = extentCoordinates[0][0];
  const referenceLat = extentCoordinates[0][1];

  const projectToMeters = ([lng, lat]: number[]) => ({
    x: toRadians(lng - referenceLng) * EARTH_RADIUS_M * cosLat,
    y: toRadians(lat - referenceLat) * EARTH_RADIUS_M,
  });
  const projected = extentCoordinates.map(projectToMeters);

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

  const viewportWidth = Math.max(params.viewportWidth, 100);
  const viewportHeight = Math.max(params.viewportHeight, 100);
  const innerWidth = viewportWidth - PLOTTING_VIEWPORT_PADDING * 2;
  const innerHeight = viewportHeight - PLOTTING_VIEWPORT_PADDING * 2;
  const scale = Math.min(innerWidth / Math.max(maxX - minX, 1), innerHeight / Math.max(maxY - minY, 1));
  const fittedWidth = Math.max((maxX - minX) * scale, 0);
  const fittedHeight = Math.max((maxY - minY) * scale, 0);
  const originX = PLOTTING_VIEWPORT_PADDING + Math.max((innerWidth - fittedWidth) / 2, 0);
  const originY = PLOTTING_VIEWPORT_PADDING + Math.max((innerHeight - fittedHeight) / 2, 0);

  const project = (coord: number[]) => {
    const { x, y } = projectToMeters(coord);
    return {
      x: originX + (x - minX) * scale,
      y: viewportHeight - originY - (y - minY) * scale,
    };
  };

  const unproject = (point: { x: number; y: number }) => {
    const xMeters = minX + (point.x - originX) / scale;
    const yMeters = minY + (viewportHeight - originY - point.y) / scale;
    return [
      referenceLng + (xMeters / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI),
      referenceLat + (yMeters / EARTH_RADIUS_M) * (180 / Math.PI),
    ] as [number, number];
  };

  return {
    width: viewportWidth,
    height: viewportHeight,
    minX,
    maxX,
    minY,
    maxY,
    scale,
    originX,
    originY,
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

// Offsets a centerline (already projected to pixel space) into two parallel edges, halfWidth
// pixels to either side - a live preview of the road's actual footprint while it's being drawn.
// At interior vertices the two adjacent segments' perpendiculars are averaged (a simple,
// unlimited miter) - fine for a draft preview, not meant to be exact join geometry.
const buildParallelOffsetLines = (points: { x: number; y: number }[], halfWidth: number) => {
  if (points.length < 2 || halfWidth <= 0) return null;
  const segmentDirs: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy) || 1;
    segmentDirs.push({ x: dx / len, y: dy / len });
  }
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const dirs = [segmentDirs[i - 1], segmentDirs[i]].filter(Boolean) as { x: number; y: number }[];
    let nx = 0;
    let ny = 0;
    dirs.forEach((d) => {
      nx += -d.y;
      ny += d.x;
    });
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    left.push({ x: points[i].x + nx * halfWidth, y: points[i].y + ny * halfWidth });
    right.push({ x: points[i].x - nx * halfWidth, y: points[i].y - ny * halfWidth });
  }
  return { left, right };
};

const offsetPointsToSvg = (points: { x: number; y: number }[]) =>
  points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");

// Boundary rings are stored closed (last point repeats the first); editing/labelling logic
// works with the unique vertex list, so this strips that trailing duplicate when present.
const getOpenRing = (coords: number[][] | null | undefined): number[][] => {
  if (!coords || coords.length < 3) return coords || [];
  const clean = [...coords];
  const first = clean[0];
  const last = clean[clean.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) clean.pop();
  return clean;
};

const getEditableGeometryPoints = (geometry: any): number[][] => {
  if (!geometry?.type) return [];
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .filter((point: any) => Array.isArray(point) && point.length >= 2)
      .map((point: number[]) => [Number(point[0]), Number(point[1])]);
  }
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates?.[0])) {
    return getOpenRing(geometry.coordinates[0]).map((point) => [Number(point[0]), Number(point[1])]);
  }
  return [];
};

const rebuildGeometryFromEditablePoints = (geometry: any, points: number[][]) => {
  if (!geometry?.type) return geometry;
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: [closeRing(points)],
    };
  }
  if (geometry.type === "LineString") {
    return {
      ...geometry,
      coordinates: points,
    };
  }
  return geometry;
};

// Fans repeated labels out around their anchor point so features whose midpoints happen to
// land close together (e.g. several roads crossing near the same parcel) don't stack their
// name labels exactly on top of one another.
const labelFanOffset = (index: number, distance = 13) => {
  const angle = ((index * 47) % 360) * (Math.PI / 180);
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
};

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
const toolForEditorTarget = (target: EditableFeatureTarget): EditorTool => (target === "boundary" ? "select" : toolForFeatureType(target));
const isFeatureType = (value: EditableFeatureTarget): value is FeatureType => value !== "boundary";
const formatEditorTargetLabel = (target: EditableFeatureTarget) =>
  target === "boundary" ? "Boundary" : `${target.charAt(0).toUpperCase()}${target.slice(1)}`;

const layerIds: Record<FeatureType | "boundary", string[]> = {
  road: ["roads-line"],
  building: ["buildings-fill", "buildings-line"],
  river: ["rivers-line"],
  fence: ["fences-line"],
  boundary: ["plot-boundary-line"],
};

const EMPTY_EDITOR_STYLE: any = {
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

const SATELLITE_EDITOR_STYLE: any = {
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
  riverName,
  setRiverName,
  roadWidth,
  setRoadWidth,
  plotId,
  meta,
  manualPoints: _manualPoints,
  beaconStyle: _beaconStyle,
  northArrowColor,
  coordinateSystem,
  onBoundaryPointChange,
}: Props) {
  const mapRef = useRef<any>(null);
  const drawRef = useRef<any>(null);
  const mapboxglRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const plottingStageRef = useRef<HTMLDivElement>(null);
  const activeDrawFeatureId = useRef<string | null>(null);
  const plottingPanRef = useRef<{ active: boolean; lastX: number; lastY: number; moved: boolean }>({
    active: false,
    lastX: 0,
    lastY: 0,
    moved: false,
  });
  const plottingPinchRef = useRef<{ dist: number; zoom: number; worldX: number; worldY: number } | null>(null);
  const [plottingStageSize, setPlottingStageSize] = useState(DEFAULT_PLOTTING_STAGE_SIZE);
  const boundaryDragRef = useRef<number | null>(null);
  const selectedVertexDragRef = useRef<number | null>(null);
  const [boundaryDraft, setBoundaryDraft] = useState<number[][] | null>(null);
  const [isDraggingBoundary, setIsDraggingBoundary] = useState(false);
  const [isDraggingSelectedVertex, setIsDraggingSelectedVertex] = useState(false);

  useEffect(() => {
    setBoundaryDraft(null);
    boundaryDragRef.current = null;
    selectedVertexDragRef.current = null;
    setIsDraggingBoundary(false);
    setIsDraggingSelectedVertex(false);
  }, [plotId]);

  // The live-edited boundary (falls back to the server copy when nothing is being dragged).
  // Kept separate from `plotCoords` so the viewport's own scale/fit doesn't jump around
  // mid-drag - only the boundary's own rendering reacts to it.
  const boundaryCoords = boundaryDraft ?? plotCoords;

  const [menu, setMenu] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [selectedGeometry, setSelectedGeometry] = useState<any>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<GeometryMetrics | null>(null);
  const [draftMetrics, setDraftMetrics] = useState<GeometryMetrics | null>(null);
  const [cursor, setCursor] = useState<{ lng: number; lat: number } | null>(null);
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("plotting");
  const [editorTarget, setEditorTarget] = useState<EditableFeatureTarget>(featureType);

  useEffect(() => {
    setEditorTarget((current) => (current === "boundary" ? current : featureType));
  }, [featureType]);

  useEffect(() => {
    const stage = plottingStageRef.current;
    if (!stage || basemapMode !== "plotting") return;
    const applySize = (width: number, height: number) => {
      setPlottingStageSize((previous) => {
        const nextWidth = Math.max(Math.round(width), 320);
        const nextHeight = Math.max(Math.round(height), 240);
        if (previous.width === nextWidth && previous.height === nextHeight) return previous;
        return { width: nextWidth, height: nextHeight };
      });
    };
    applySize(stage.clientWidth, stage.clientHeight);
    // Coalesce bursts of resize notifications (e.g. the sidebar's own width transition) into at
    // most one state update per animation frame, instead of one per observer callback - avoids
    // driving a chain of renders that visibly jitters the plotting stage while it settles.
    let rafId: number | null = null;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const box = entry.contentBoxSize?.[0];
        if (box) {
          applySize(box.inlineSize, box.blockSize);
        } else {
          applySize(entry.contentRect.width, entry.contentRect.height);
        }
      });
    });
    observer.observe(stage);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [basemapMode, isOpen]);

  const plottingPageWidth = plottingStageSize.width;
  const plottingPageHeight = plottingStageSize.height;
  const plottingViewportX = PLOTTING_VIEWPORT_MARGIN;
  const plottingViewportY = PLOTTING_VIEWPORT_MARGIN;
  const plottingViewportBoxWidth = Math.max(plottingPageWidth - PLOTTING_VIEWPORT_MARGIN * 2, 100);
  const plottingViewportBoxHeight = Math.max(plottingPageHeight - PLOTTING_VIEWPORT_MARGIN * 2, 100);

  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [showEditorHelp, setShowEditorHelp] = useState(false);
  const [showTraversePanel, setShowTraversePanel] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(DEFAULT_LAYER_VISIBILITY);
  const [featureInventory, setFeatureInventory] = useState<FeatureInventory>(DEFAULT_INVENTORY);
  const [featureCollections, setFeatureCollections] = useState<FeatureCollectionState>(DEFAULT_FEATURE_COLLECTIONS);
  const [plottingPoints, setPlottingPoints] = useState<number[][]>([]);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [savingAction, setSavingAction] = useState(false);
  const [plottingCamera, setPlottingCamera] = useState<PlottingCamera>(DEFAULT_PLOTTING_CAMERA);
  const [plottingPanActive, setPlottingPanActive] = useState(false);
  const autoFitPlottedViewRef = useRef(false);
  const [selectedFeatureRecord, setSelectedFeatureRecord] = useState<FeatureRecord | null>(null);
  const [draftingAssist, setDraftingAssist] = useState<DraftingAssistState>(DEFAULT_DRAFTING_ASSIST);
  const [plottingHoverPoint, setPlottingHoverPoint] = useState<number[] | null>(null);
  const [plottingSnapLabel, setPlottingSnapLabel] = useState<string | null>(null);
  const [plottingSnapState, setPlottingSnapState] = useState<{
    x: number;
    y: number;
    type: "endpoint" | "midpoint" | "intersection";
    label: string;
  } | null>(null);
  const [osnapModes, setOsnapModes] = useState<OsnapModes>(DEFAULT_OSNAP_MODES);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [selectionDrag, setSelectionDrag] = useState<SelectionDrag>(null);
  const [multiSelectedKeys, setMultiSelectedKeys] = useState<string[]>([]);
  const [commandInput, setCommandInput] = useState("");
  const [commandMessages, setCommandMessages] = useState<string[]>([
    "HELP lists drawing commands. Use BOX or LASSO to select multiple objects.",
  ]);
  const [screenCursor, setScreenCursor] = useState<{ x: number; y: number } | null>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  const cursorDisplay = useMemo(() => {
    if (!cursor) return null;
    const activeSystem = coordinateSystem || "wgs84";
    const [x, y] = fromWGS84(cursor.lng, cursor.lat, activeSystem);
    const labels = getCoordinateAxisLabels(activeSystem);
    const formattedX = formatEditorCoordinateValue(x, activeSystem);
    const formattedY = formatEditorCoordinateValue(y, activeSystem);
    return {
      compact: `${labels.xShort} ${formattedX}${labels.units} | ${labels.yShort} ${formattedY}${labels.units}`,
      full: `${labels.x}: ${formattedX}${labels.units}, ${labels.y}: ${formattedY}${labels.units}`,
    };
  }, [coordinateSystem, cursor]);
  const coordinateAxisLabels = useMemo(
    () => getCoordinateAxisLabels(coordinateSystem || "wgs84"),
    [coordinateSystem]
  );

  const suggestions = useMemo(() => {
    const input = commandInput.trim().toUpperCase();
    if (!input) return [];
    return ALL_COMMANDS.filter((cmd) => cmd.startsWith(input) || cmd.split(" ").some(part => part.startsWith(input)));
  }, [commandInput]);

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
        viewportWidth: plottingViewportBoxWidth,
        viewportHeight: plottingViewportBoxHeight,
    }),
    [featureCollections, plotCoords, plottingDraftGeometry, selectedGeometry, plottingViewportBoxWidth, plottingViewportBoxHeight]
  );
  const plottingZoomPercent = useMemo(() => `${Math.round(plottingCamera.zoom * 100)}%`, [plottingCamera.zoom]);
  const plottingInverseZoom = 1 / Math.max(plottingCamera.zoom, 0.0001);
  const traverseFirstCoordUtm = useMemo(() => {
    const firstCoord = boundaryCoords?.[0];
    if (!firstCoord) return { easting: "--", northing: "--" };
    const [eA, nA] = fromWGS84(firstCoord[0], firstCoord[1], coordinateSystem || "utm_32n");
    return { easting: `${eA.toFixed(3)}m`, northing: `${nA.toFixed(3)}m` };
  }, [boundaryCoords, coordinateSystem]);
  const traverseRows = useMemo(() => {
    if (!boundaryCoords || boundaryCoords.length < 2) return [];
    const cleanCoords = getOpenRing(boundaryCoords);
    return cleanCoords.map((start, i) => {
      const end = cleanCoords[(i + 1) % cleanCoords.length];
      return {
        key: `tbl-row-${i}`,
        from: getStationName(i),
        to: getStationName((i + 1) % cleanCoords.length),
        bearing: getSegmentBearing(start, end),
        length: `${haversineDistanceMeters(start, end).toFixed(2)}m`,
      };
    });
  }, [boundaryCoords]);
  const plottingPreviewPoints = useMemo(() => {
    if (basemapMode !== "plotting" || activeTool === "select" || !plottingHoverPoint) return plottingPoints;
    return [...plottingPoints, plottingHoverPoint];
  }, [activeTool, basemapMode, plottingHoverPoint, plottingPoints]);
  const plottingPreviewGeometry = useMemo(
    () => (plottingPreviewPoints.length > plottingPoints.length ? buildGeometryFromPoints(plottingPreviewPoints, activeTool) : null),
    [activeTool, plottingPoints.length, plottingPreviewPoints]
  );
  const roadWidthMeters = useMemo(() => {
    const parsed = Number(String(roadWidth || "").trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [roadWidth]);
  // While actively drawing a road, show its real-world width as two parallel edges around the
  // centerline (instead of only a single line) so the drafted footprint matches the chosen
  // road width before it's added.
  const roadWidthPreviewLines = useMemo(() => {
    if (editorTarget !== "road" || action === "delete" || activeTool === "select") return null;
    if (plottingPreviewPoints.length < 2) return null;
    const halfWidthPx = ((roadWidthMeters ?? 0) / 2) * plottingViewport.scale;
    if (!Number.isFinite(halfWidthPx) || halfWidthPx <= 0) return null;
    const projected = plottingPreviewPoints.map((point) => plottingViewport.project(point));
    return buildParallelOffsetLines(projected, halfWidthPx);
  }, [action, activeTool, editorTarget, plottingPreviewPoints, plottingViewport, roadWidthMeters]);
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
  const selectedCoordinateRows = useMemo<CoordinateRowDisplay[]>(() => {
    const activeSystem = coordinateSystem || "wgs84";
    return geometryToCoordinateList(selectedGeometry)
      .slice(0, 8)
      .map((coord, index) => {
        const [x, y] = fromWGS84(coord[0], coord[1], activeSystem);
        return {
          key: `${coord[0]}-${coord[1]}-${index}`,
          label: editorTarget === "boundary" ? getStationName(index) : `P${index + 1}`,
          x: formatEditorCoordinateValue(x, activeSystem),
          y: formatEditorCoordinateValue(y, activeSystem),
        };
      });
  }, [coordinateSystem, editorTarget, selectedGeometry]);
  const multiSelectedRecords = useMemo(
    () => objectRecords.filter((record) => multiSelectedKeys.includes(record.key)),
    [multiSelectedKeys, objectRecords]
  );
  const selectedObjectCount = multiSelectedKeys.length;
  const osnapSummary = useMemo(
    () =>
      `${osnapModes.endpoint ? "End" : ""}${osnapModes.midpoint ? `${osnapModes.endpoint ? " · " : ""}Mid` : ""}${osnapModes.intersection ? `${osnapModes.endpoint || osnapModes.midpoint ? " · " : ""}Int` : ""}` || "Off",
    [osnapModes.endpoint, osnapModes.intersection, osnapModes.midpoint]
  );
  const workspaceSummary = useMemo(
    () => [
      {
        label: "Coord system",
        value: getCoordinateSystemName(coordinateSystem || "wgs84"),
      },
      {
        label: "Visible",
        value: `${visibleObjectRecords.length}`,
      },
      {
        label: "Selected",
        value: selectedObjectCount > 1 ? `${selectedObjectCount} set` : selectedFeatureRecord?.label || "None",
      },
      {
        label: "View",
        value: basemapMode === "plotting" ? "Plotting view" : "Satellite view",
      },
    ],
    [basemapMode, coordinateSystem, selectedFeatureRecord?.label, selectedObjectCount, visibleObjectRecords.length]
  );
  const toolbarMetaItems = useMemo(
    () => [
      {
        label: "Scale",
        value: meta.scale_text || "1 : 250",
      },
      {
        label: "Coords",
        value: getCoordinateSystemCompactName(coordinateSystem || "wgs84"),
      },
      {
        label: "View",
        value: basemapMode === "plotting" ? `Plotting ${plottingZoomPercent}` : "Satellite review",
      },
    ],
    [basemapMode, coordinateSystem, meta.scale_text, plottingZoomPercent]
  );
  const plottingAnnotationState = useMemo(() => {
    const zoom = plottingCamera.zoom;
    const boundaryFocused = editorTarget === "boundary";
    return {
      showBoundaryArea: boundaryFocused || zoom >= 0.95,
      showBoundaryMeasurements: boundaryFocused || zoom >= 1.15,
      showBoundaryStations: boundaryFocused || zoom >= 1.35,
      showRoadLabels: zoom >= 1.2,
      showBuildingLabels: zoom >= 1.45,
    };
  }, [editorTarget, plottingCamera.zoom]);
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
    if (osnapModes.endpoint && boundaryCoords?.length) {
      boundaryCoords.forEach((coord, index) => pushCandidate(coord, `Boundary ${index + 1}`));
    }
    if (osnapModes.endpoint && boundaryCoords?.length) {
      segmentSets.push({
        label: "Boundary",
        segments: getGeometrySegments({ type: "Polygon", coordinates: [boundaryCoords] }),
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
    if (osnapModes.midpoint && boundaryCoords?.length) {
      getGeometrySegments({ type: "Polygon", coordinates: [boundaryCoords] }).forEach((segment, index) => {
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
  }, [layerVisibility, objectRecords, osnapModes.endpoint, osnapModes.intersection, osnapModes.midpoint, boundaryCoords]);
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

  const pushCommandMessage = useCallback((message: string) => {
    setCommandMessages((previous) => [...previous.slice(-7), message]);
  }, []);

  const activateSelectionMode = useCallback((mode: SelectionMode) => {
    setSelectionMode((previous) => (previous === mode ? null : mode));
    setActiveTool("select");
    setPlottingPoints([]);
    setPlottingHoverPoint(null);
    setSelectionDrag(null);
  }, []);

  const isStyleReady = useCallback((map: any) => {
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
      setEditorTarget(nextFeatureType);
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
        if (nextWidth) {
          setRoadWidth(nextWidth);
        }
      }

      if (nextFeatureType === "river") {
        const nextName = typeof properties?.name === "string" ? String(properties.name) : "";
        setRiverName(nextName);
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
    [action, basemapMode, setAction, setEditorTarget, setFeatureType, setRoadName, setRoadWidth]
  );

  const applyBasemapMode = useCallback((map: any, mode: BasemapMode) => {
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

  const ensureCadOverlay = useCallback((map: any) => {
    if (!isStyleReady(map)) return;
    const beforeId = map
      .getStyle()
      ?.layers?.find((layer: any) => String(layer.id || "").startsWith("gl-draw"))?.id;
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
      (map.getSource("cad-mask-src") as any).setData(overlay.mask as any);
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
      (map.getSource("cad-grid-src") as any).setData(overlay.grid as any);
    }
  }, [isStyleReady, plotCoords]);

  const applyLayerVisibility = useCallback((map: any, state: LayerVisibility) => {
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
    (map: any, collections: FeatureCollectionState) => {
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
        (map.getSource("roads-src") as any).setData(roadsData as any);
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
        (map.getSource("buildings-src") as any).setData(buildingsData as any);
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
        (map.getSource("rivers-src") as any).setData(riversData as any);
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
        (map.getSource("fences-src") as any).setData(fencesData as any);
      }

      applyLayerVisibility(map, layerVisibility);
      applyBasemapMode(map, basemapMode);
    },
    [applyBasemapMode, applyLayerVisibility, basemapMode, isStyleReady, layerVisibility]
  );

  const fitPlotBoundary = useCallback(() => {
    if (basemapMode === "plotting") {
      if (!boundaryCoords?.length) {
        setPlottingCamera(DEFAULT_PLOTTING_CAMERA);
        return;
      }
      const bounds = getProjectedBounds(boundaryCoords, plottingViewport.project);
      if (!bounds) {
        setPlottingCamera(DEFAULT_PLOTTING_CAMERA);
        return;
      }
      const fitPadding = Math.min(84, Math.max(48, Math.min(plottingViewportBoxWidth, plottingViewportBoxHeight) * 0.08));
      const availableWidth = Math.max(plottingViewportBoxWidth - fitPadding * 2, 40);
      const availableHeight = Math.max(plottingViewportBoxHeight - fitPadding * 2, 40);
      const fitZoom = Math.min(
        PLOTTING_ZOOM_MAX,
        Math.max(
          PLOTTING_ZOOM_MIN,
          Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
        ),
      );
      setPlottingCamera({
        zoom: fitZoom,
        offsetX: plottingViewportBoxWidth / 2 - bounds.centerX * fitZoom,
        offsetY: plottingViewportBoxHeight / 2 - bounds.centerY * fitZoom,
      });
      return;
    }
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
    if (!map || !mapboxgl || !plotCoords?.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    plotCoords.forEach(([lng, lat]) => bounds.extend([lng, lat]));
      map.fitBounds(bounds, { padding: 48, duration: 300 });
    }, [basemapMode, boundaryCoords, plotCoords, plottingViewport, plottingViewportBoxHeight, plottingViewportBoxWidth]);

  useEffect(() => {
    if (!isOpen) return;
    setShowLeftSidebar(false);
    setShowRightSidebar(false);
    setShowTraversePanel(false);
    setShowEditorHelp(false);
    setSelectionMode(null);
    setShowSuggestions(false);
    setActiveSuggestionIndex(0);
    setPlottingCamera(DEFAULT_PLOTTING_CAMERA);
    autoFitPlottedViewRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      autoFitPlottedViewRef.current = false;
      return;
    }
    if (basemapMode !== "plotting") {
      autoFitPlottedViewRef.current = false;
      return;
    }
    if (!boundaryCoords?.length) {
      autoFitPlottedViewRef.current = false;
      return;
    }
    if (autoFitPlottedViewRef.current) return;
    const frame = requestAnimationFrame(() => {
      fitPlotBoundary();
      autoFitPlottedViewRef.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [basemapMode, boundaryCoords, fitPlotBoundary, isOpen]);

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
    setPendingSave(null);
    setActiveTool("select");
    drawRef.current?.changeMode("simple_select");
  }, []);

  const undoLastVertex = useCallback(() => {
    setPlottingPoints((prev) => {
      if (prev.length === 0) {
        pushCommandMessage("No vertices to undo.");
        return prev;
      }
      const next = prev.slice(0, -1);
      pushCommandMessage(
        next.length > 0
          ? `Last vertex undone. ${next.length} points remain.`
          : "All vertices cleared."
      );
      if (next.length === 0) {
        setPlottingHoverPoint(null);
      } else {
        setPlottingHoverPoint(next[next.length - 1]);
      }
      return next;
    });
  }, [pushCommandMessage]);

  const startAddFlow = useCallback(() => {
    if (editorTarget === "boundary") {
      toast("Boundary is protected. Switch to Road, Building, River, or Fence to add a new feature.");
      return;
    }
    setPendingSave(null);
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
    setEditorTool(toolForEditorTarget(editorTarget));
  }, [editorTarget, setAction, setEditorTool]);

  // Switching the Feature Type dropdown (e.g. Road -> Building) must also resync the active
  // drawing tool (line vs polygon), or the points already placed keep building whatever geometry
  // the old tool produces while getting saved tagged as the new type - e.g. a 2-point line saved
  // as a "building", which then renders as a degenerate sliver instead of a proper building block.
  // Safest fix is to clear any in-progress draft on a type change during "add", since a line draft
  // can't be reinterpreted as a polygon draft (and vice versa) - the user re-draws in the new tool.
  const handleFeatureTypeChange = useCallback(
    (next: EditableFeatureTarget) => {
      if (next === editorTarget) return;
      const hadDraftInProgress = action === "add" && plottingPoints.length > 0;
      setEditorTarget(next);
      setPendingSave(null);
      drawRef.current?.deleteAll();
      activeDrawFeatureId.current = null;
      setPlottingPoints([]);
      setPlottingHoverPoint(null);
      setPlottingSnapLabel(null);
      setDraftMetrics(null);
      setSelectedGeometry(null);
      setSelectedFeatureRecord(null);
      setSelectedMetrics(null);
      setMultiSelectedKeys([]);

      if (next === "boundary") {
        setAction("update");
        setEditorTool("select");
        toast("Boundary editing armed. Drag a boundary vertex in plotting view to adjust the parcel outline.");
        return;
      }

      setFeatureType(next);
      if (action === "add") {
        setEditorTool(toolForFeatureType(next));
        if (hadDraftInProgress) {
          toast(`Switched to ${next} - restart the drawing (feature type changed mid-draw).`);
        }
      } else if (isFeatureType(next)) {
        setEditorTool("select");
      }
    },
    [action, editorTarget, plottingPoints.length, setAction, setEditorTool, setFeatureType]
  );

  const startUpdateFlow = useCallback(() => {
    setPendingSave(null);
    if (editorTarget === "boundary") {
      setAction("update");
      setEditorTool("select");
      toast("Boundary editing is active. Drag the parcel vertices directly in plotting view.");
      return;
    }
    if (!selectedGeometry) {
      toast("Select a detected feature first, then modify it.");
      return;
    }
    setAction("update");
    setEditorTool("select");
  }, [editorTarget, selectedGeometry, setAction, setEditorTool]);

  const startDeleteFlow = useCallback(() => {
    setPendingSave(null);
    if (editorTarget === "boundary") {
      toast("Boundary delete is locked. Switch back to another feature type if you want to remove a saved feature.");
      return;
    }
    if (!selectedGeometry && multiSelectedKeys.length === 0) {
      toast("Select the feature(s) you want to remove first.");
      return;
    }
    setAction("delete");
    setEditorTool("select");
  }, [editorTarget, selectedGeometry, multiSelectedKeys, setAction, setEditorTool]);

  const activeCommandLabel =
    editorTarget === "boundary"
      ? "Adjust boundary"
      : action === "delete"
      ? "Delete selected feature"
      : action === "update"
        ? "Modify selected feature"
        : "Add new feature";

  const deleteTargetCount = multiSelectedKeys.length > 0 ? multiSelectedKeys.length : hasSelectedGeometry ? 1 : 0;

  const primaryActionLabel =
    editorTarget === "boundary"
      ? "Boundary editing active"
      : action === "delete"
      ? deleteTargetCount > 1
        ? `Delete ${deleteTargetCount} Selected Features`
        : "Delete Selected Feature"
      : action === "update"
        ? "Apply Changes"
        : "Add Feature";

  const canSave =
    editorTarget === "boundary"
      ? false
      : action === "delete"
      ? deleteTargetCount > 0
      : action === "update"
        ? hasSelectedGeometry
        : hasDraftGeometry || hasSelectedGeometry;
  const selectionHeadline =
    selectedObjectCount > 1 ? `${selectedObjectCount} objects selected` : selectedFeatureRecord?.label || "No active selection";

  useEffect(() => {
    setPendingSave(null);
  }, [action, selectedGeometry, featureType, editorTarget, multiSelectedKeys]);

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
    let disposed = false;
    const container = containerRef.current;

    void (async () => {
      const mapboxgl = await loadMapboxGl();
      if (disposed || !container) return;

      mapboxglRef.current = mapboxgl;

      const map = new mapboxgl.Map({
        container,
        style: basemapMode === "satellite" ? SATELLITE_EDITOR_STYLE : EMPTY_EDITOR_STYLE,
        center: [7.5, 9.0],
        zoom: 12,
        pitchWithRotate: false,
        dragRotate: false,
      });

      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "top-right");
      map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
      mapRef.current = map;

      const MapboxDraw = await loadMapboxDraw();
      if (disposed || mapRef.current !== map) return;

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
        defaultMode: "simple_select",
      });
      map.addControl(draw);

      const selectFeature = (nextFeatureType: FeatureType) => (event: any) => {
        if (!drawRef.current || !event.features?.length) return;
        const sourceFeature = event.features[0];
        if (!sourceFeature.geometry) return;
        setActiveTool("select");
        importGeometryIntoEditor(sourceFeature.geometry, nextFeatureType, sourceFeature.properties as Record<string, any>);
      };

      const contextMenu = (nextFeatureType: FeatureType) => (event: any) => {
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

      map.on("mousemove", (event: any) => {
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

      if (disposed) {
        map.remove();
        return;
      }

      drawRef.current = draw;
    })();

    return () => {
      disposed = true;
      activeDrawFeatureId.current = null;
      drawRef.current = null;
      mapboxglRef.current = null;
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
      setPlottingSnapState(null);
    }
  }, [activeTool, basemapMode]);

  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // AutoCAD Standard F-Key Shortcuts - always global
      if (event.key === "F3") {
        event.preventDefault();
        setOsnapModes((prev) => {
          const nextVal = !prev.endpoint;
          pushCommandMessage(`OSNAP toggled: ${nextVal ? "ON" : "OFF"} (F3)`);
          return { endpoint: nextVal, midpoint: nextVal, intersection: nextVal };
        });
        setDraftingAssist((prev) => ({ ...prev, snap: !prev.snap }));
        return;
      }
      if (event.key === "F7") {
        event.preventDefault();
        setBasemapMode((prev) => {
          const nextMode = prev === "satellite" ? "plotting" : "satellite";
          pushCommandMessage(`Basemap switched to ${nextMode} (F7)`);
          return nextMode;
        });
        return;
      }
      if (event.key === "F8") {
        event.preventDefault();
        setDraftingAssist((prev) => {
          const nextOrtho = !prev.ortho;
          pushCommandMessage(`Ortho toggled: ${nextOrtho ? "ON" : "OFF"} (F8)`);
          return { ...prev, ortho: nextOrtho };
        });
        return;
      }

      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      // Undo last vertex during line/polygon drawing
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (activeTool !== "select" && plottingPoints.length > 0) {
          undoLastVertex();
        } else {
          pushCommandMessage("No action to undo.");
        }
        return;
      }
      
      if (event.key === "Escape") {
        event.preventDefault();
        clearWorkingSelection();
        pushCommandMessage("Command cancelled.");
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        startDeleteFlow();
        pushCommandMessage("Erasing selected feature.");
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (activeTool !== "select" && plottingPoints.length >= 2) {
          const geometry = buildGeometryFromPoints(plottingPoints, activeTool);
          if (geometry) {
            setSelectedGeometry(geometry);
            setSelectedMetrics(getGeometryMetrics(geometry));
            setDraftMetrics(getGeometryMetrics(geometry));
            setActiveTool("select");
            pushCommandMessage("Drawing committed.");
          }
        }
        return;
      }

      switch (key) {
        case "l":
          event.preventDefault();
          setEditorTool("draw_line_string");
          setSelectionMode(null);
          pushCommandMessage("Line tool active (L).");
          break;
        case "p":
          event.preventDefault();
          setEditorTool("draw_polygon");
          setSelectionMode(null);
          pushCommandMessage("Polygon tool active (P).");
          break;
        case "s":
          event.preventDefault();
          setActiveTool("select");
          setSelectionMode(null);
          pushCommandMessage("Select tool active (S).");
          break;
        case "z":
          event.preventDefault();
          fitPlotBoundary();
          pushCommandMessage("View fit to plot (Z).");
          break;
        case "o":
          event.preventDefault();
          setDraftingAssist((prev) => {
            const nextOrtho = !prev.ortho;
            pushCommandMessage(`Ortho mode toggled: ${nextOrtho ? "ON" : "OFF"} (O)`);
            return { ...prev, ortho: nextOrtho };
          });
          break;
        case "n":
          event.preventDefault();
          setDraftingAssist((prev) => {
            const nextSnap = !prev.snap;
            pushCommandMessage(`Snap constraint toggled: ${nextSnap ? "ON" : "OFF"} (N)`);
            return { ...prev, snap: nextSnap };
          });
          break;
        case "m":
          event.preventDefault();
          setDraftingAssist((prev) => {
            const nextMeasure = !prev.measure;
            pushCommandMessage(`Measure feedback toggled: ${nextMeasure ? "ON" : "OFF"} (M)`);
            return { ...prev, measure: nextMeasure };
          });
          break;
        case "b":
          event.preventDefault();
          activateSelectionMode("box");
          pushCommandMessage("Box selection armed (B).");
          break;
        case "u":
          event.preventDefault();
          if (activeTool !== "select" && plottingPoints.length > 0) {
            undoLastVertex();
          } else {
            clearWorkingSelection();
            pushCommandMessage("Draft cleared (U).");
          }
          break;
        case "h":
          event.preventDefault();
          pushCommandMessage("Hotkeys: L=Line, P=Polygon, S=Select, Z=Zoom Fit, O=Ortho, N=Snap, M=Measure, B=Box Select, U=Undo/Clear, Delete=Erase, Enter=Commit.");
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [
    isOpen,
    activeTool,
    plottingPoints,
    clearWorkingSelection,
    fitPlotBoundary,
    startDeleteFlow,
    pushCommandMessage,
    setEditorTool,
    activateSelectionMode,
    undoLastVertex,
  ]);

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
      const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * plottingPageWidth;
      const y = ((clientY - rect.top) / Math.max(rect.height, 1)) * plottingPageHeight;
      return { x, y };
    },
    [plottingPageWidth, plottingPageHeight]
  );

  const plottingScreenToCanvasPoint = useCallback(
    (point: { x: number; y: number }) => ({
      x: (point.x - plottingViewportX - plottingCamera.offsetX) / plottingCamera.zoom,
      y: (point.y - plottingViewportY - plottingCamera.offsetY) / plottingCamera.zoom,
    }),
    [plottingCamera.offsetX, plottingCamera.offsetY, plottingCamera.zoom, plottingViewportX, plottingViewportY]
  );

  const getViewportCoordinateAtPixel = useCallback((xPx: number, yPx: number) => {
    const canvasX = (xPx - plottingCamera.offsetX) / plottingCamera.zoom;
    const canvasY = (yPx - plottingCamera.offsetY) / plottingCamera.zoom;
    const wgs = plottingViewport.unproject({ x: canvasX, y: canvasY });
    const [easting, northing] = fromWGS84(wgs[0], wgs[1], coordinateSystem || "utm_32n");
    return {
      easting: `${Math.round(easting)}mE`,
      northing: `${Math.round(northing)}mN`,
    };
  }, [plottingCamera.offsetX, plottingCamera.offsetY, plottingCamera.zoom, plottingViewport, coordinateSystem]);

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
      if (boundaryDragRef.current !== null) {
        const canvasPoint = plottingScreenToCanvasPoint(rawPointer);
        const [lng, lat] = plottingViewport.unproject(canvasPoint);
        const index = boundaryDragRef.current;
        setBoundaryDraft((previous) => {
          const base = previous ?? getOpenRing(plotCoords);
          const next = [...base];
          next[index] = [lng, lat];
          return next;
        });
        return;
      }
      if (selectedVertexDragRef.current !== null && selectedGeometry) {
        const canvasPoint = plottingScreenToCanvasPoint(rawPointer);
        const [lng, lat] = plottingViewport.unproject(canvasPoint);
        const index = selectedVertexDragRef.current;
        const basePoints = getEditableGeometryPoints(selectedGeometry);
        if (index >= 0 && index < basePoints.length) {
          const nextPoints = [...basePoints];
          nextPoints[index] = [lng, lat];
          const nextGeometry = rebuildGeometryFromEditablePoints(selectedGeometry, nextPoints);
          const nextMetrics = getGeometryMetrics(nextGeometry);
          setSelectedGeometry(nextGeometry);
          setSelectedMetrics(nextMetrics);
          setDraftMetrics(nextMetrics);
          setPlottingPoints(nextPoints);
          setSelectedFeatureRecord((previous) =>
            previous
              ? {
                  ...previous,
                  geometry: nextGeometry,
                  metrics: nextMetrics,
                  coordinates: geometryToCoordinateList(nextGeometry),
                }
              : previous
          );
        }
        return;
      }
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
      if (label) {
        let type: "endpoint" | "midpoint" | "intersection" = "endpoint";
        const labelLower = label.toLowerCase();
        if (labelLower.includes("· mid") || labelLower.includes(" mid ")) {
          type = "midpoint";
        } else if (labelLower.includes(" x ") || labelLower.includes("intersection")) {
          type = "intersection";
        }
        setPlottingSnapState({ x: pointer.x, y: pointer.y, type, label });
      } else {
        setPlottingSnapState(null);
      }
      if (activeTool !== "select") {
        setPlottingHoverPoint([lng, lat]);
      }

      // AutoCAD style screen cursor coordinate projection for snaps (offset by the viewport frame's page position)
      const screenX = plottingViewportX + plottingCamera.offsetX + pointer.x * plottingCamera.zoom;
      const screenY = plottingViewportY + plottingCamera.offsetY + pointer.y * plottingCamera.zoom;
      setScreenCursor({ x: screenX, y: screenY });
    },
    [activeTool, basemapMode, getPlottingPointer, plottingScreenToCanvasPoint, plottingViewport, resolvePlottingCanvasPoint, selectionDrag, plottingCamera.offsetX, plottingCamera.offsetY, plottingCamera.zoom, plottingViewportX, plottingViewportY, plotCoords]
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
      const rawPointer = getPlottingPointer(event.currentTarget, event.clientX, event.clientY);
      // Prevent drawing clicks outside the map viewport frame
      if (
        rawPointer.x < plottingViewportX ||
        rawPointer.x > plottingViewportX + plottingViewportBoxWidth ||
        rawPointer.y < plottingViewportY ||
        rawPointer.y > plottingViewportY + plottingViewportBoxHeight
      )
        return;
      const { point: pointer, label } = resolvePlottingCanvasPoint(
        plottingScreenToCanvasPoint(rawPointer)
      );
      const [lng, lat] = plottingViewport.unproject(pointer);
      setPlottingPoints((previous) => [...previous, [lng, lat]]);
      setPlottingHoverPoint([lng, lat]);
      setPlottingSnapLabel(label);
    },
    [
      activeTool,
      basemapMode,
      getPlottingPointer,
      plottingScreenToCanvasPoint,
      plottingViewport,
      resolvePlottingCanvasPoint,
      selectionMode,
      plottingViewportX,
      plottingViewportY,
      plottingViewportBoxWidth,
      plottingViewportBoxHeight,
    ]
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
      if (activeTool === "select" && !selectionMode && editorTarget === "boundary" && layerVisibility.boundary && boundaryCoords) {
        // Pick whichever boundary vertex is nearest the click, in real screen pixels, rather
        // than relying on per-vertex hit-testing - vertices close together (common on tight
        // bends) would otherwise fight over whichever one happens to paint on top.
        const localX = pointer.x - plottingViewportX;
        const localY = pointer.y - plottingViewportY;
        const cleanCoords = getOpenRing(boundaryCoords);
        let nearestIndex = -1;
        let nearestDistance = Infinity;
        cleanCoords.forEach((coord, index) => {
          const projected = plottingViewport.project(coord);
          const screenX = plottingCamera.offsetX + projected.x * plottingCamera.zoom;
          const screenY = plottingCamera.offsetY + projected.y * plottingCamera.zoom;
          const distance = Math.hypot(localX - screenX, localY - screenY);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });
        if (nearestIndex >= 0 && nearestDistance <= 14) {
          event.preventDefault();
          boundaryDragRef.current = nearestIndex;
          setIsDraggingBoundary(true);
          return;
        }
      }
      if (
        activeTool === "select" &&
        !selectionMode &&
        action === "update" &&
        editorTarget !== "boundary" &&
        selectedGeometry
      ) {
        const localX = pointer.x - plottingViewportX;
        const localY = pointer.y - plottingViewportY;
        const editablePoints = getEditableGeometryPoints(selectedGeometry);
        let nearestIndex = -1;
        let nearestDistance = Infinity;
        editablePoints.forEach((coord, index) => {
          const projected = plottingViewport.project(coord);
          const screenX = plottingCamera.offsetX + projected.x * plottingCamera.zoom;
          const screenY = plottingCamera.offsetY + projected.y * plottingCamera.zoom;
          const distance = Math.hypot(localX - screenX, localY - screenY);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });
        if (nearestIndex >= 0 && nearestDistance <= 14) {
          event.preventDefault();
          selectedVertexDragRef.current = nearestIndex;
          setIsDraggingSelectedVertex(true);
          return;
        }
      }
      if (selectionMode) {
        event.preventDefault();
        setSelectionDrag(
          selectionMode === "box"
            ? { mode: "box", start: pointer, current: pointer }
            : { mode: "lasso", points: [pointer] }
        );
      }
    },
    [
      basemapMode,
      getPlottingPointer,
      selectionMode,
      activeTool,
      action,
      editorTarget,
      layerVisibility.boundary,
      boundaryCoords,
      selectedGeometry,
      plottingViewport,
      plottingCamera.offsetX,
      plottingCamera.offsetY,
      plottingCamera.zoom,
      plottingViewportX,
      plottingViewportY,
    ]
  );

  const commitBoundaryDrag = useCallback(() => {
    const index = boundaryDragRef.current;
    boundaryDragRef.current = null;
    setIsDraggingBoundary(false);
    if (index === null) return;
    setBoundaryDraft((current) => {
      const coords = current?.[index];
      if (coords) {
        onBoundaryPointChange?.(index, [coords[0], coords[1]]);
      }
      return current;
    });
  }, [onBoundaryPointChange]);

  const commitSelectedVertexDrag = useCallback(() => {
    selectedVertexDragRef.current = null;
    setIsDraggingSelectedVertex(false);
  }, []);

  const handlePlottingMouseUp = useCallback(
    (event?: ReactMouseEvent<SVGSVGElement>) => {
      if (boundaryDragRef.current !== null) {
        commitBoundaryDrag();
        if (event) event.preventDefault();
        return;
      }
      if (selectedVertexDragRef.current !== null) {
        commitSelectedVertexDrag();
        if (event) event.preventDefault();
        return;
      }
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
    [
      importGeometryIntoEditor,
      objectRecords,
      resolveSelectionKeysFromShape,
      selectionDrag,
      commitBoundaryDrag,
      commitSelectedVertexDrag,
    ]
  );

  const handlePlottingWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      if (basemapMode !== "plotting") return;
      event.preventDefault();
      const rawPointer = getPlottingPointer(event.currentTarget, event.clientX, event.clientY);
      // rawPointer is in full-page space; offsetX/offsetY operate in the viewport-local space
      // (the frame sits at plottingViewportX/Y within the page), so the pointer must be
      // translated into that same local space before it can anchor the zoom.
      const localX = rawPointer.x - plottingViewportX;
      const localY = rawPointer.y - plottingViewportY;
      setPlottingCamera((previous) => {
        const nextZoom = Math.min(PLOTTING_ZOOM_MAX, Math.max(PLOTTING_ZOOM_MIN, previous.zoom * (event.deltaY > 0 ? 0.9 : 1.12)));
        if (Math.abs(nextZoom - previous.zoom) < 0.0001) return previous;
        const worldX = (localX - previous.offsetX) / previous.zoom;
        const worldY = (localY - previous.offsetY) / previous.zoom;
        return {
          zoom: nextZoom,
          offsetX: localX - worldX * nextZoom,
          offsetY: localY - worldY * nextZoom,
        };
      });
    },
    [basemapMode, getPlottingPointer, plottingViewportX, plottingViewportY]
  );

  // Two-finger pinch-to-zoom for touch devices. `touch-action: none` on the SVG (needed so a
  // single drafting finger doesn't trigger the browser's own scroll/zoom) also disables native
  // pinch-zoom, so it has to be reimplemented here using the same zoom-around-a-point math as
  // handlePlottingWheel. The pinch's starting distance/zoom/world-anchor are captured once at
  // touchstart and kept fixed for the gesture, so zoom scales smoothly off that baseline instead
  // of compounding per-frame, while the anchor point is re-projected under the moving two-finger
  // midpoint each move - giving combined pinch-zoom + two-finger pan, like a mobile map.
  const getPlottingTouchMidpoint = useCallback(
    (target: SVGSVGElement, touches: React.TouchList) => {
      const [t1, t2] = [touches[0], touches[1]];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rawPointer = getPlottingPointer(target, (t1.clientX + t2.clientX) / 2, (t1.clientY + t2.clientY) / 2);
      return {
        dist,
        localX: rawPointer.x - plottingViewportX,
        localY: rawPointer.y - plottingViewportY,
      };
    },
    [getPlottingPointer, plottingViewportX, plottingViewportY]
  );

  const handlePlottingTouchStart = useCallback(
    (event: React.TouchEvent<SVGSVGElement>) => {
      if (basemapMode !== "plotting" || event.touches.length !== 2) return;
      const { dist, localX, localY } = getPlottingTouchMidpoint(event.currentTarget, event.touches);
      plottingPanRef.current.active = false;
      setPlottingPanActive(false);
      setPlottingCamera((previous) => {
        plottingPinchRef.current = {
          dist,
          zoom: previous.zoom,
          worldX: (localX - previous.offsetX) / previous.zoom,
          worldY: (localY - previous.offsetY) / previous.zoom,
        };
        return previous;
      });
    },
    [basemapMode, getPlottingTouchMidpoint]
  );

  const handlePlottingTouchMove = useCallback(
    (event: React.TouchEvent<SVGSVGElement>) => {
      if (basemapMode !== "plotting" || event.touches.length !== 2 || !plottingPinchRef.current) return;
      const pinch = plottingPinchRef.current;
      if (pinch.dist <= 0) return;
      const { dist, localX, localY } = getPlottingTouchMidpoint(event.currentTarget, event.touches);
      const nextZoom = Math.min(PLOTTING_ZOOM_MAX, Math.max(PLOTTING_ZOOM_MIN, pinch.zoom * (dist / pinch.dist)));
      setPlottingCamera({
        zoom: nextZoom,
        offsetX: localX - pinch.worldX * nextZoom,
        offsetY: localY - pinch.worldY * nextZoom,
      });
    },
    [basemapMode, getPlottingTouchMidpoint]
  );

  const handlePlottingTouchEnd = useCallback((event: React.TouchEvent<SVGSVGElement>) => {
    if (event.touches.length < 2) {
      plottingPinchRef.current = null;
    }
  }, []);

  const handlePlottingMouseLeave = useCallback(() => {
    if (boundaryDragRef.current !== null) {
      commitBoundaryDrag();
    }
    if (selectedVertexDragRef.current !== null) {
      commitSelectedVertexDrag();
    }
    plottingPanRef.current.active = false;
    plottingPanRef.current.moved = false;
    setPlottingPanActive(false);
    setCursor(null);
    setPlottingHoverPoint(null);
    setPlottingSnapLabel(null);
    setPlottingSnapState(null);
    setSelectionDrag(null);
    setScreenCursor(null);
  }, [commitBoundaryDrag, commitSelectedVertexDrag]);

  const zoomPlottingCamera = useCallback((direction: "in" | "out") => {
    setPlottingCamera((previous) => {
      const factor = direction === "in" ? 1.3 : 1 / 1.3;
      const nextZoom = Math.min(PLOTTING_ZOOM_MAX, Math.max(PLOTTING_ZOOM_MIN, previous.zoom * factor));
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



  const runCadCommand = useCallback(
    (rawInput: string) => {
      const normalized = rawInput.trim().toLowerCase();
      if (!normalized) return;
      const compact = normalized.replace(/\s+/g, " ");

      // AutoCAD Command Alias Mapping
      let cmd = compact;
      if (cmd === "l") cmd = "line";
      if (cmd === "pl" || cmd === "pline" || cmd === "poly") cmd = "polygon";
      if (cmd === "m" || cmd === "move") cmd = "modify";
      if (cmd === "e" || cmd === "erase" || cmd === "del") cmd = "delete";
      if (cmd === "z" || cmd === "zoom") cmd = "fit";
      if (cmd === "c" || cmd === "esc") cmd = "clear";
      if (cmd === "u") cmd = "undo";

      if (cmd === "help") {
        pushCommandMessage("Commands: SELECT, LINE, POLYGON, BOX, LASSO, ROAD, BUILDING, RIVER, FENCE, ADD, MODIFY, DELETE, FIT, ZOOM IN, ZOOM OUT, SNAP ON/OFF, ORTHO ON/OFF, MEASURE ON/OFF, OSNAP ENDPOINT/MIDPOINT/INTERSECTION, SATELLITE, PLOTTING, UNDO, CLEAR.");
        return;
      }
      if (cmd === "select") {
        setActiveTool("select");
        setSelectionMode(null);
        pushCommandMessage("Select tool active.");
        return;
      }
      if (cmd === "line") {
        setEditorTool("draw_line_string");
        setSelectionMode(null);
        pushCommandMessage("Line tool active.");
        return;
      }
      if (cmd === "polygon") {
        setEditorTool("draw_polygon");
        setSelectionMode(null);
        pushCommandMessage("Polygon tool active.");
        return;
      }
      if (cmd === "box") {
        activateSelectionMode("box");
        pushCommandMessage("Box selection armed.");
        return;
      }
      if (cmd === "lasso") {
        activateSelectionMode("lasso");
        pushCommandMessage("Lasso selection armed.");
        return;
      }
      if (cmd === "add") {
        startAddFlow();
        pushCommandMessage(editorTarget === "boundary" ? "Boundary is protected from add commands." : "Add command active.");
        return;
      }
      if (cmd === "modify") {
        startUpdateFlow();
        pushCommandMessage(editorTarget === "boundary" ? "Boundary edit is active. Drag parcel vertices in plotting view." : "Modify command active.");
        return;
      }
      if (cmd === "delete") {
        startDeleteFlow();
        pushCommandMessage(editorTarget === "boundary" ? "Boundary is protected from delete commands." : "Delete command active.");
        return;
      }
      if (cmd === "road" || cmd === "building" || cmd === "river" || cmd === "fence" || cmd === "boundary") {
        handleFeatureTypeChange(cmd as EditableFeatureTarget);
        pushCommandMessage(`Feature type set to ${cmd}.`);
        return;
      }
      if (cmd === "fit") {
        fitPlotBoundary();
        pushCommandMessage("View fit to plot.");
        return;
      }
      if (cmd === "zoom in") {
        zoomPlottingCamera("in");
        pushCommandMessage("Plotting zoom increased.");
        return;
      }
      if (cmd === "zoom out") {
        zoomPlottingCamera("out");
        pushCommandMessage("Plotting zoom reduced.");
        return;
      }
      if (cmd === "satellite" || cmd === "plotting") {
        setBasemapMode(cmd as BasemapMode);
        pushCommandMessage(`Basemap switched to ${cmd}.`);
        return;
      }
      if (cmd === "clear") {
        clearWorkingSelection();
        pushCommandMessage("Working selection cleared.");
        return;
      }
      if (cmd === "undo") {
        if (activeTool !== "select" && plottingPoints.length > 0) {
          undoLastVertex();
        } else {
          clearWorkingSelection();
          pushCommandMessage("Working selection cleared (UNDO).");
        }
        return;
      }
      if (cmd === "snap") {
        setDraftingAssist((prev) => {
          const next = !prev.snap;
          pushCommandMessage(`Snap toggled: ${next ? "ON" : "OFF"}`);
          return { ...prev, snap: next };
        });
        return;
      }
      if (cmd === "ortho") {
        setDraftingAssist((prev) => {
          const next = !prev.ortho;
          pushCommandMessage(`Ortho toggled: ${next ? "ON" : "OFF"}`);
          return { ...prev, ortho: next };
        });
        return;
      }
      if (cmd === "grid") {
        setBasemapMode((prev) => {
          const next = prev === "satellite" ? "plotting" : "satellite";
          pushCommandMessage(`Basemap switched to ${next}.`);
          return next;
        });
        return;
      }
      if (cmd.startsWith("snap ")) {
        const value = cmd.split(" ")[1];
        if (value === "on" || value === "off") {
          setDraftingAssist((previous) => ({ ...previous, snap: value === "on" }));
          pushCommandMessage(`Snap ${value}.`);
          return;
        }
      }
      if (cmd.startsWith("ortho ")) {
        const value = cmd.split(" ")[1];
        if (value === "on" || value === "off") {
          setDraftingAssist((previous) => ({ ...previous, ortho: value === "on" }));
          pushCommandMessage(`Ortho ${value}.`);
          return;
        }
      }
      if (cmd.startsWith("measure ")) {
        const value = cmd.split(" ")[1];
        if (value === "on" || value === "off") {
          setDraftingAssist((previous) => ({ ...previous, measure: value === "on" }));
          pushCommandMessage(`Measure ${value}.`);
          return;
        }
      }
      if (cmd.startsWith("osnap ")) {
        const mode = cmd.split(" ")[1];
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
      handleFeatureTypeChange,
      pushCommandMessage,
      setEditorTool,
      startAddFlow,
      startDeleteFlow,
      startUpdateFlow,
      toggleOsnapMode,
      zoomPlottingCamera,
      activeTool,
      editorTarget,
      plottingPoints.length,
      undoLastVertex,
    ]
  );

  const handleCommandSubmit = useCallback(() => {
    const next = commandInput.trim();
    if (!next) return;
    runCadCommand(next);
    setCommandHistory((prev) => {
      if (prev.length > 0 && prev[0] === next) return prev;
      return [next, ...prev].slice(0, 50);
    });
    historyIndexRef.current = -1;
    setCommandInput("");
    setShowSuggestions(false);
  }, [commandInput, runCadCommand]);

  const handleCommandInputChange = (val: string) => {
    setCommandInput(val);
    setShowSuggestions(val.trim().length > 0);
    setActiveSuggestionIndex(0);
  };

  const handleSuggestionClick = (suggestion: string) => {
    runCadCommand(suggestion);
    setCommandHistory((prev) => {
      if (prev.length > 0 && prev[0] === suggestion) return prev;
      return [suggestion, ...prev].slice(0, 50);
    });
    historyIndexRef.current = -1;
    setCommandInput("");
    setShowSuggestions(false);
  };

  const handleCommandKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (showSuggestions && suggestions.length > 0) {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveSuggestionIndex((prev) => (prev + 1) % suggestions.length);
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          setCommandInput(suggestions[activeSuggestionIndex]);
          setShowSuggestions(false);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const selectedCmd = suggestions[activeSuggestionIndex];
          runCadCommand(selectedCmd);
          setCommandHistory((prev) => {
            if (prev.length > 0 && prev[0] === selectedCmd) return prev;
            return [selectedCmd, ...prev].slice(0, 50);
          });
          historyIndexRef.current = -1;
          setCommandInput("");
          setShowSuggestions(false);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setShowSuggestions(false);
          return;
        }
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (commandHistory.length > 0) {
          const nextIndex = historyIndexRef.current + 1;
          if (nextIndex < commandHistory.length) {
            setCommandInput(commandHistory[nextIndex]);
            historyIndexRef.current = nextIndex;
          }
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = historyIndexRef.current - 1;
        if (nextIndex >= 0) {
          setCommandInput(commandHistory[nextIndex]);
          historyIndexRef.current = nextIndex;
        } else {
          setCommandInput("");
          historyIndexRef.current = -1;
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handleCommandSubmit();
      }
    },
    [showSuggestions, suggestions, activeSuggestionIndex, commandHistory, handleCommandSubmit, runCadCommand]
  );

  const plottingGridLines = useMemo(() => {
    const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; major: boolean }> = [];
    const majorEvery = 5;
    let index = 0;
    const startX = Math.floor(plottingViewport.minX / plottingViewport.gridStepMeters) * plottingViewport.gridStepMeters;
    for (let x = startX; x <= plottingViewport.maxX + plottingViewport.gridStepMeters; x += plottingViewport.gridStepMeters) {
      const screenX = plottingViewport.originX + (x - plottingViewport.minX) * plottingViewport.scale;
      lines.push({
        key: `x-${x}`,
        x1: screenX,
        y1: Math.max(plottingViewport.originY - PLOTTING_VIEWPORT_PADDING / 2, 0),
        x2: screenX,
        y2: Math.min(plottingViewport.height - plottingViewport.originY + PLOTTING_VIEWPORT_PADDING / 2, plottingViewport.height),
        major: index % majorEvery === 0,
      });
      index += 1;
    }
    index = 0;
    const startY = Math.floor(plottingViewport.minY / plottingViewport.gridStepMeters) * plottingViewport.gridStepMeters;
    for (let y = startY; y <= plottingViewport.maxY + plottingViewport.gridStepMeters; y += plottingViewport.gridStepMeters) {
      const screenY = plottingViewport.height - plottingViewport.originY - (y - plottingViewport.minY) * plottingViewport.scale;
      lines.push({
        key: `y-${y}`,
        x1: Math.max(plottingViewport.originX - PLOTTING_VIEWPORT_PADDING / 2, 0),
        y1: screenY,
        x2: Math.min(plottingViewport.width - plottingViewport.originX + PLOTTING_VIEWPORT_PADDING / 2, plottingViewport.width),
        y2: screenY,
        major: index % majorEvery === 0,
      });
      index += 1;
    }
    return lines;
  }, [plottingViewport]);

  // Removes features from local state by their objectRecords key (`${type}-${index}`) so the
  // editor reflects a save immediately without waiting on a refetch of /features/geojson. Indices
  // to remove are resolved from the pre-mutation snapshot and grouped per type so removing several
  // features from the same collection in one batch doesn't shift indices out from under itself.
  const removeFeaturesByKeys = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    const indicesByType = new Map<FeatureType, Set<number>>();
    keys.forEach((key) => {
      const [type, indexStr] = key.split("-");
      const index = Number(indexStr);
      if (!type || Number.isNaN(index)) return;
      const set = indicesByType.get(type as FeatureType) || new Set<number>();
      set.add(index);
      indicesByType.set(type as FeatureType, set);
    });
    setFeatureCollections((previous) => {
      const next = { ...previous };
      indicesByType.forEach((indices, type) => {
        const collection = previous[type];
        if (!collection) return;
        next[type] = {
          ...collection,
          features: collection.features.filter((_: any, i: number) => !indices.has(i)),
        };
      });
      return next;
    });
  }, []);

  // Validates the current draft/selection and, if it's ready to save, hands the details to the
  // confirm popup instead of saving right away - the actual mutation only happens once the user
  // picks "Yes" there (see confirmPendingSave).
  const handleSave = () => {
    if (action === "delete") {
      const targets: FeatureRecord[] =
        multiSelectedKeys.length > 0
          ? objectRecords.filter((r) => multiSelectedKeys.includes(r.key))
          : selectedFeatureRecord
            ? [selectedFeatureRecord]
            : selectedGeometry
              ? [
                  {
                    key: `${featureType}-selection`,
                    type: featureType,
                    label: "Selected feature",
                    properties: {},
                    geometry: selectedGeometry,
                    metrics: null,
                    coordinates: [],
                  },
                ]
              : [];
      if (targets.length === 0) {
        toast.error("Select the feature(s) you want to remove first.");
        return;
      }
      setPendingSave({ kind: "delete", targets });
      return;
    }

    if (action === "update" && !selectedGeometry) {
      toast.error("Select a feature first, then apply the update.");
      return;
    }

    const draw = drawRef.current;
    const data = draw?.getAll();
    let feature = data?.features?.[data.features.length - 1];
    // plottingDraftGeometry is only trustworthy while a draw tool is still active - it's a
    // memo of buildGeometryFromPoints(plottingPoints, activeTool), and finishing a shape (Enter
    // or double-click) resets activeTool to "select" while leaving plottingPoints in place, which
    // silently recomputes it as a LineString regardless of what was actually drawn. Once the tool
    // is "select", the just-finished/just-selected geometry lives in selectedGeometry instead.
    if (!feature && activeTool !== "select" && plottingDraftGeometry) {
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
    if (!feature && plottingDraftGeometry) {
      feature = {
        type: "Feature",
        properties: {},
        geometry: plottingDraftGeometry,
      } as any;
    }
    if (!feature) {
      toast.error(action === "add" ? "Draw the new feature first." : "No geometry is ready to save.");
      return;
    }

    const savedFeatureType = featureType;
    const savedAction = action;
    const savedGeometry = feature.geometry;

    // Belt-and-braces: a building must save as a Polygon and every other feature type as a
    // LineString. If the drawing tool and the Feature Type dropdown ever fall out of sync (e.g.
    // the type was switched mid-draw before this state existed), this stops a degenerate geometry
    // being saved and silently rendering as a broken sliver instead of a proper feature.
    const expectedGeometryType = savedFeatureType === "building" ? "Polygon" : "LineString";
    if (savedGeometry?.type !== expectedGeometryType) {
      toast.error(
        `The drawn shape doesn't match "${savedFeatureType}" (expected a ${expectedGeometryType.toLowerCase()}). Please redraw it.`
      );
      return;
    }

    const savedName =
      savedFeatureType === "road" ? roadName : savedFeatureType === "river" ? riverName : undefined;
    const savedWidth = savedFeatureType === "road" ? roadWidthMeters ?? undefined : undefined;
    if (savedFeatureType === "road" && (!savedWidth || savedWidth <= 0)) {
      toast.error("Enter a valid road width in meters before saving this road.");
      return;
    }
    const replacedKey = savedAction === "update" ? selectedFeatureRecord?.key : undefined;

    setPendingSave({
      kind: "upsert",
      featureType: savedFeatureType,
      action: savedAction,
      geometry: savedGeometry,
      name: savedName,
      width_m: savedWidth,
      replacedKey,
    });
  };

  const cancelPendingSave = useCallback(() => {
    setPendingSave(null);
  }, []);

  const confirmPendingSave = useCallback(async () => {
    const pending = pendingSave;
    if (!pending) return;
    setPendingSave(null);

    if (pending.kind === "delete") {
      setSavingAction(true);
      const removedKeys: string[] = [];
      let successCount = 0;
      try {
        for (const target of pending.targets) {
          const ok = await onSave({
            feature_type: target.type,
            action: "delete",
            geojson: target.geometry,
          });
          if (ok) {
            successCount += 1;
            removedKeys.push(target.key);
          }
        }
      } finally {
        setSavingAction(false);
      }

      if (removedKeys.length > 0) {
        removeFeaturesByKeys(removedKeys);
      }
      if (successCount > 0) {
        toast.success(successCount > 1 ? `${successCount} features deleted` : "Feature deleted");
      }
      if (successCount < pending.targets.length) {
        toast.error(`${pending.targets.length - successCount} feature(s) failed to delete`);
      }
      clearWorkingSelection();
      return;
    }

    setSavingAction(true);
    let ok = false;
    try {
      ok = await onSave({
        feature_type: pending.featureType,
        action: pending.action,
        name: pending.name,
        width_m: pending.width_m,
        geojson: pending.geometry,
      });
    } finally {
      setSavingAction(false);
    }
    if (!ok) return;

    if (pending.replacedKey) {
      removeFeaturesByKeys([pending.replacedKey]);
    }
    setFeatureCollections((previous) => {
      const collection = previous[pending.featureType];
      const newFeature = {
        type: "Feature",
        geometry: pending.geometry,
        properties: { source: "override", name: pending.name, width_m: pending.width_m },
      };
      return {
        ...previous,
        [pending.featureType]: { ...collection, features: [...collection.features, newFeature] },
      };
    });
    toast.success(pending.action === "add" ? "Feature added" : "Feature updated");
    clearWorkingSelection();
  }, [pendingSave, onSave, removeFeaturesByKeys, clearWorkingSelection]);

  const pendingSaveDescription = (() => {
    if (!pendingSave) return "";
    if (pendingSave.kind === "delete") {
      return pendingSave.targets.length > 1
        ? `delete ${pendingSave.targets.length} selected features (${pendingSave.targets.map((t) => t.type).join(", ")})`
        : `delete the selected ${pendingSave.targets[0]?.type || "feature"}`;
    }
    return pendingSave.action === "add"
      ? `add this new ${pendingSave.featureType}`
      : `apply the change to the selected ${pendingSave.featureType}`;
  })();

  const suggestedTool = toolForEditorTarget(editorTarget);
  const suggestedToolLabel =
    suggestedTool === "draw_polygon" ? "Polygon tool" : suggestedTool === "draw_line_string" ? "Line tool" : "Select tool";
  const cadMetaTooltip = `R of O ${meta.adamawa_rof_no || plotId || "590"} | ${meta.adamawa_owner_name || meta.title_text || "Survey Plan"} | ${meta.location_text || "Pilot Plot"} | Scale ${meta.scale_text || "1 : 250"} | ${meta.surveyor_rank || "Surveyor General"}`;

  if (!isOpen) return null;

  return (
    <div className="feature-override-modal">
      <div className="feature-override-card cad-editor-card">
        <div className="cad-toolbar">
          <div className="cad-toolbar-brand" title="Feature CAD Editor — Survey Plan Drafting Workspace">
            <CadIcon name="cad" className="cad-toolbar-brand-icon" />
          </div>

          <div className="cad-toolbar-group">
            <button
              type="button"
              className={`cad-icon-btn${activeTool === "select" ? " active" : ""}`}
              title="Select"
              onClick={() => {
                setEditorTool("select");
                setSelectionMode(null);
              }}
            >
              <CadIcon name="select" />
            </button>
            <button
              type="button"
              className={`cad-icon-btn${selectionMode === "box" ? " active" : ""}`}
              title="Box select"
              onClick={() => activateSelectionMode("box")}
            >
              <CadIcon name="box-select" />
            </button>
            <button
              type="button"
              className={`cad-icon-btn${selectionMode === "lasso" ? " active" : ""}`}
              title="Lasso select"
              onClick={() => activateSelectionMode("lasso")}
            >
              <CadIcon name="lasso" />
            </button>
            <button
              type="button"
              className={`cad-icon-btn${activeTool === "draw_line_string" ? " active" : ""}`}
              title="Line"
              onClick={() => {
                setSelectionMode(null);
                setEditorTool("draw_line_string");
              }}
            >
              <CadIcon name="line" />
            </button>
            <button
              type="button"
              className={`cad-icon-btn${activeTool === "draw_polygon" ? " active" : ""}`}
              title="Polygon"
              onClick={() => {
                setSelectionMode(null);
                setEditorTool("draw_polygon");
              }}
            >
              <CadIcon name="polygon" />
            </button>
            <button
              type="button"
              className="cad-icon-btn"
              title={`Match ${suggestedToolLabel}`}
              onClick={() => {
                setSelectionMode(null);
                setEditorTool(suggestedTool);
              }}
            >
              <CadIcon name="wand" />
            </button>
          </div>

          <span className="cad-toolbar-divider" />

          <div className="cad-toolbar-group">
            <button type="button" className="cad-icon-btn" title="Fit Plot" onClick={fitPlotBoundary}>
              <CadIcon name="fit" />
            </button>
            {basemapMode === "plotting" ? (
              <>
                <button type="button" className="cad-icon-btn" title="Zoom In" onClick={() => zoomPlottingCamera("in")}>
                  <CadIcon name="zoom-in" />
                </button>
                <button type="button" className="cad-icon-btn" title="Zoom Out" onClick={() => zoomPlottingCamera("out")}>
                  <CadIcon name="zoom-out" />
                </button>
              </>
            ) : null}
            <button type="button" className="cad-icon-btn" title="Clear Draft" onClick={clearWorkingSelection}>
              <CadIcon name="clear" />
            </button>
          </div>

          <span className="cad-toolbar-divider" />

          <div className="cad-toolbar-group cad-toolbar-group--editing" title="Pick a feature type, then Add, Modify, or Delete it in the plotting area below.">
            <CadIcon name="info" className="cad-toolbar-group-cue" />
            <select
              className="cad-toolbar-select"
              value={editorTarget}
              onChange={(event) => handleFeatureTypeChange(event.target.value as EditableFeatureTarget)}
              title="Feature type"
            >
              <option value="road">Road</option>
              <option value="building">Building</option>
              <option value="river">River</option>
              <option value="fence">Fence</option>
              <option value="boundary">Boundary</option>
            </select>
            {editorTarget === "road" && action !== "delete" ? (
              <label className="cad-toolbar-inline-field" title="Road width in meters">
                <span>Width (m)</span>
                <input
                  className="cad-toolbar-input"
                  type="number"
                  min="0.1"
                  step="0.1"
                  inputMode="decimal"
                  value={roadWidth}
                  onChange={(event) => setRoadWidth(event.target.value)}
                  placeholder="10"
                />
              </label>
            ) : null}
            <button
              type="button"
              className={`cad-icon-btn${action === "add" ? " active" : ""}`}
              title={editorTarget === "boundary" ? "Boundary is protected from add commands" : "Add New"}
              onClick={startAddFlow}
              disabled={editorTarget === "boundary"}
            >
              <CadIcon name="add" />
            </button>
            <button type="button" className={`cad-icon-btn${action === "update" ? " active" : ""}`} title="Modify Selected" onClick={startUpdateFlow}>
              <CadIcon name="modify" />
            </button>
            <button
              type="button"
              className={`cad-icon-btn danger${action === "delete" ? " active" : ""}`}
              title={editorTarget === "boundary" ? "Boundary is protected from delete commands" : "Delete Selected"}
              onClick={startDeleteFlow}
              disabled={editorTarget === "boundary"}
            >
              <CadIcon name="delete" />
            </button>
          </div>

          <span className="cad-toolbar-divider" />

          <div className="cad-toolbar-group">
            <select
              className="cad-toolbar-select"
              value={basemapMode}
              onChange={(event) => setBasemapMode(event.target.value as BasemapMode)}
              title="Basemap"
            >
              <option value="satellite">Satellite</option>
              <option value="plotting">Plotting</option>
            </select>
          </div>

          <div className="cad-toolbar-meta" title={cadMetaTooltip}>
            {toolbarMetaItems.map((item) => (
              <div key={item.label} className="cad-toolbar-meta-chip" title={`${item.label}: ${item.value}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
            <div className="cad-toolbar-meta-chip cad-toolbar-meta-chip--selection" title={`Selection: ${selectionHeadline}`}>
              <span>Selection</span>
              <strong>{selectionHeadline}</strong>
            </div>
          </div>

          <div className="cad-toolbar-spacer" />

          <div className="cad-toolbar-group">
            {basemapMode === "plotting" && (
              <button
                type="button"
                className={`cad-icon-btn${showTraversePanel ? " active" : ""}`}
                title="Traverse table"
                onClick={() => setShowTraversePanel((value) => !value)}
              >
                <CadIcon name="table" />
              </button>
            )}
            <button
              type="button"
              className={`cad-icon-btn${showEditorHelp ? " active" : ""}`}
              title="Editor help"
              onClick={() => setShowEditorHelp(true)}
            >
              <CadIcon name="info" />
            </button>
            <button
              type="button"
              className={`cad-icon-btn${showLeftSidebar ? " active" : ""}`}
              title="Toggle Setup & Layers panel"
              onClick={() => setShowLeftSidebar(!showLeftSidebar)}
            >
              <CadIcon name="layers" />
            </button>
            <button
              type="button"
              className={`cad-icon-btn${showRightSidebar ? " active" : ""}`}
              title="Toggle Inspector panel"
              onClick={() => setShowRightSidebar(!showRightSidebar)}
            >
              <CadIcon name="inspector" />
            </button>
          </div>

          <span className="cad-toolbar-divider" />

          <button type="button" className="cad-icon-btn cad-icon-btn--close" title="Close editor" onClick={onClose}>
            <CadIcon name="close" />
          </button>
        </div>

        <div className="cad-editor-body">
          <aside className="cad-editor-sidebar" style={{ display: showLeftSidebar ? "block" : "none" }}>
            <section className="cad-panel cad-panel--workspace">
              <div className="cad-panel-head" style={{ position: "relative" }}>
                <strong>Workspace</strong>
                <span>Quick survey context</span>
                <button
                  type="button"
                  className="cad-panel-close-btn"
                  onClick={() => setShowLeftSidebar(false)}
                  title="Collapse panel"
                >
                  &times;
                </button>
              </div>
              <div className="cad-workspace-grid">
                {workspaceSummary.map((item) => (
                  <div key={item.label} className="cad-workspace-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Feature Setup</strong>
                <span>Choose the layer you want to work on.</span>
              </div>
              <div className="feature-override-controls cad-form-grid">
                <div className="field">
                  <label>Feature Type</label>
                  <select value={editorTarget} onChange={(event) => handleFeatureTypeChange(event.target.value as EditableFeatureTarget)}>
                    <option value="road">Road</option>
                    <option value="building">Building</option>
                    <option value="river">River</option>
                    <option value="fence">Fence</option>
                    <option value="boundary">Boundary</option>
                  </select>
                </div>
                {editorTarget === "road" && action !== "delete" && (
                  <div className="field wide">
                    <label>Road Name</label>
                    <input value={roadName} onChange={(event) => setRoadName(event.target.value)} placeholder="e.g. Access Road A" />
                  </div>
                )}
                {editorTarget === "river" && action !== "delete" && (
                  <div className="field wide">
                    <label>River Name</label>
                    <input value={riverName} onChange={(event) => setRiverName(event.target.value)} placeholder="e.g. Ikpa River" />
                  </div>
                )}
                {editorTarget === "road" && action !== "delete" && (
                  <div className="field">
                    <label>Road Width (m)</label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      inputMode="decimal"
                      value={roadWidth}
                      onChange={(event) => setRoadWidth(event.target.value)}
                      placeholder="Enter road width in meters"
                    />
                  </div>
                )}
                <div className="hint">
                  Roads, rivers, and fences use lines. Buildings use polygons. Boundary stays locked until you intentionally select it.
                </div>
              </div>
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Feature Register</strong>
                <span>Pick an object to review or edit.</span>
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
                <strong>Layer Visibility</strong>
                <span>Show only the references you need.</span>
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
          </aside>

          <div className={`cad-editor-canvas cad-editor-canvas--${basemapMode}`}>
            <div className="cad-canvas-workspace-wrapper" style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              {basemapMode === "plotting" ? (
                <div className="feature-override-map cad-plotting-stage" ref={plottingStageRef}>
                {false ? <div className="cad-plotting-ribbon">
                  <div className="cad-plotting-ribbon-main">
                    <span>{meta.template_name === "adamawa_osg" ? "Survey plan layout" : "Drafting sheet"}</span>
                    <strong>{meta.adamawa_owner_name || meta.title_text || "Survey drafting workspace"}</strong>
                    <small>
                      {(meta.location_text || "Parcel layout").trim()} · R of O {meta.adamawa_rof_no || plotId || "590"}
                    </small>
                  </div>
                  <div className="cad-plotting-ribbon-meta">
                    {toolbarMetaItems.map((item) => (
                      <div key={item.label} className="cad-plotting-ribbon-chip">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div> : null}
                <div className="cad-plotting-help">
                  Wheel to zoom. Hold middle mouse and drag to pan.
                  {selectionMode ? ` ${selectionMode === "box" ? "Drag a window to select multiple objects." : "Trace a lasso to select multiple objects."}` : ""}
                </div>
                <svg
                  className={`cad-plotting-svg${plottingPanActive ? " is-panning" : ""}`}
                  viewBox={`0 0 ${plottingPageWidth} ${plottingPageHeight}`}
                  onMouseMove={handlePlottingMouseMove}
                  onMouseDown={handlePlottingMouseDown}
                  onMouseUp={handlePlottingMouseUp}
                  onMouseLeave={handlePlottingMouseLeave}
                  onWheel={handlePlottingWheel}
                  onTouchStart={handlePlottingTouchStart}
                  onTouchMove={handlePlottingTouchMove}
                  onTouchEnd={handlePlottingTouchEnd}
                  onTouchCancel={handlePlottingTouchEnd}
                  onClick={handlePlottingCanvasClick}
                  onDoubleClick={handlePlottingCanvasDoubleClick}
                  onAuxClick={(event) => event.preventDefault()}
                >
                  <defs>
                    <clipPath id="cad-viewport-clip">
                      <rect x="0" y="0" width={plottingViewportBoxWidth} height={plottingViewportBoxHeight} />
                    </clipPath>
                  </defs>

                  {/* Full-bleed dark model-space background */}
                  <rect x="0" y="0" width={plottingPageWidth} height={plottingPageHeight} className="cad-plot-bg" />

                  {/* Map viewport frame */}
                  <rect x={plottingViewportX} y={plottingViewportY} width={plottingViewportBoxWidth} height={plottingViewportBoxHeight} fill="none" stroke="#2563eb" strokeWidth="1.5" />

                  {/* Viewport Corner UTM Grid Coordinates Labels */}
                  {(() => {
                    const tl = getViewportCoordinateAtPixel(0, 0);
                    const tr = getViewportCoordinateAtPixel(plottingViewportBoxWidth, 0);
                    const bl = getViewportCoordinateAtPixel(0, plottingViewportBoxHeight);
                    const br = getViewportCoordinateAtPixel(plottingViewportBoxWidth, plottingViewportBoxHeight);
                    const left = plottingViewportX + 8;
                    const right = plottingViewportX + plottingViewportBoxWidth - 8;
                    const top1 = plottingViewportY + 15;
                    const top2 = plottingViewportY + 27;
                    const bottom1 = plottingViewportY + plottingViewportBoxHeight - 18;
                    const bottom2 = plottingViewportY + plottingViewportBoxHeight - 6;
                    return (
                      <g fill="#38bdf8" fontSize="9" fontFamily="monospace" fontWeight="bold">
                        {/* Top-left corner */}
                        <text x={left} y={top1} textAnchor="start">{tl.easting}</text>
                        <text x={left} y={top2} textAnchor="start">{tl.northing}</text>

                        {/* Top-right corner */}
                        <text x={right} y={top1} textAnchor="end">{tr.easting}</text>
                        <text x={right} y={top2} textAnchor="end">{tr.northing}</text>

                        {/* Bottom-left corner */}
                        <text x={left} y={bottom1} textAnchor="start">{bl.easting}</text>
                        <text x={left} y={bottom2} textAnchor="start">{bl.northing}</text>

                        {/* Bottom-right corner */}
                        <text x={right} y={bottom1} textAnchor="end">{br.easting}</text>
                        <text x={right} y={bottom2} textAnchor="end">{br.northing}</text>
                      </g>
                    );
                  })()}

                  {/* Clipped map viewport group */}
                  <g transform={`translate(${plottingViewportX}, ${plottingViewportY})`}>
                    <g clipPath="url(#cad-viewport-clip)">
                      {/* Panned/zoomed group */}
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
                        {layerVisibility.boundary && boundaryCoords?.length ? (
                          <polygon
                            points={pointsToSvg(closeRing(boundaryCoords), plottingViewport.project)}
                            className={`cad-svg-boundary${isDraggingBoundary ? " is-editing" : ""}`}
                          />
                        ) : null}

                        {/* Centroid Area in Hectares (centered in plot in red, constant screen size regardless of zoom) */}
                        {layerVisibility.boundary && plottingAnnotationState.showBoundaryArea && boundaryCoords && boundaryCoords.length >= 3 && (() => {
                          const centroid = getCentroid(boundaryCoords, plottingViewport.project);
                          const areaSqm = polygonAreaSqm([boundaryCoords]);
                          const areaHec = areaSqm / 10000;
                          return (
                            <g transform={`translate(${centroid.x} ${centroid.y}) scale(${plottingInverseZoom})`}>
                              <text
                                x={0}
                                y={0}
                                fill="#ef4444"
                                fontSize="11.5"
                                fontWeight="bold"
                                fontFamily="monospace"
                                textAnchor="middle"
                                className="cad-svg-halo-text"
                              >
                                {areaHec.toFixed(2)} Hectares
                              </text>
                            </g>
                          );
                        })()}

                        {/* AutoCAD style geodesic Bearings and Distances labels parallel to boundary segments, constant screen size */}
                        {layerVisibility.boundary && plottingAnnotationState.showBoundaryMeasurements && boundaryCoords && boundaryCoords.length >= 2 && (() => {
                          const labels: any[] = [];
                          const cleanCoords = getOpenRing(boundaryCoords);
                          for (let i = 0; i < cleanCoords.length; i++) {
                            const start = cleanCoords[i];
                            const end = cleanCoords[(i + 1) % cleanCoords.length];
                            const pStart = plottingViewport.project(start);
                            const pEnd = plottingViewport.project(end);
                            const midX = (pStart.x + pEnd.x) / 2;
                            const midY = (pStart.y + pEnd.y) / 2;
                            const dist = haversineDistanceMeters(start, end);
                            const bearingStr = getSegmentBearing(start, end);
                            const distStr = `${dist.toFixed(2)}m`;

                            let angleRad = Math.atan2(pEnd.y - pStart.y, pEnd.x - pStart.x);
                            let angleDeg = (angleRad * 180) / Math.PI;
                            if (angleDeg > 90 || angleDeg < -90) {
                              angleDeg += 180;
                            }

                            labels.push(
                              <g key={`lbl-${i}`} transform={`translate(${midX}, ${midY}) rotate(${angleDeg}) scale(${plottingInverseZoom})`}>
                                <text y="-5" fill="#ef4444" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle" className="cad-svg-halo-text">{bearingStr}</text>
                                <text y="7" fill="#ef4444" fontSize="9.5" fontWeight="bold" fontFamily="monospace" textAnchor="middle" className="cad-svg-halo-text">{distStr}</text>
                              </g>
                            );
                          }
                          return labels;
                        })()}

                        {/* Beacons and Station Names (A, B, C...) at vertices, constant screen size, draggable in Select mode */}
                        {layerVisibility.boundary && plottingAnnotationState.showBoundaryStations && boundaryCoords && (() => {
                          const cleanCoords = getOpenRing(boundaryCoords);
                          return cleanCoords.map((coord, index) => {
                            const projected = plottingViewport.project(coord);
                            const station = getStationName(index);
                            const isBeingDragged = isDraggingBoundary && boundaryDragRef.current === index;
                            return (
                              <g
                                key={`beacon-${index}`}
                                className={`cad-svg-beacon${isBeingDragged ? " is-dragging" : ""}${activeTool === "select" ? " is-draggable" : ""}`}
                                transform={`translate(${projected.x} ${projected.y}) scale(${plottingInverseZoom})`}
                              >
                                {/* Larger invisible hit target - hover/visual affordance only; the
                                    actual pick uses nearest-vertex-wins logic in handlePlottingMouseDown */}
                                <circle r="12" fill="transparent" className="cad-svg-beacon-hit" />
                                {/* Cross mark at center */}
                                <g stroke="#334155" strokeWidth="1.2">
                                  <line x1={-7} y1={0} x2={7} y2={0} />
                                  <line x1={0} y1={-7} x2={0} y2={7} />
                                </g>
                                <text x={8} y={-8} fill="#f8fafc" fontSize="11" fontWeight="bold" fontFamily="monospace" className="cad-svg-halo-text">{station}</text>
                              </g>
                            );
                          });
                        })()}

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
                                {labelPoint && (plottingAnnotationState.showRoadLabels || descriptor?.key === selectedFeatureRecord?.key || isMultiSelected) ? (() => {
                                  const fan = labelFanOffset(index);
                                  return (
                                    <g transform={`translate(${labelPoint.x} ${labelPoint.y}) scale(${plottingInverseZoom})`}>
                                      <text x={fan.x} y={fan.y} textAnchor="middle" className="cad-svg-label">
                                        {feature?.properties?.name || `Road ${index + 1}`}
                                      </text>
                                    </g>
                                  );
                                })() : null}
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
                            // A valid building ring needs a Polygon with >=3 real coordinate pairs.
                            // A LineString's coordinates[0] is a single [lng, lat] pair, which also
                            // passes Array.isArray() - guard that case explicitly so a mistagged
                            // non-polygon geometry (see handleFeatureTypeChange/handleSave) fails
                            // safely instead of rendering as a garbled sliver.
                            const rawRing = geometry?.type === "Polygon" && Array.isArray(geometry?.coordinates?.[0]) ? geometry.coordinates[0] : null;
                            const ring = Array.isArray(rawRing) && rawRing.length >= 3 && rawRing.every((pt: any) => Array.isArray(pt) && pt.length >= 2) ? rawRing : null;
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
                                {labelPoint && (plottingAnnotationState.showBuildingLabels || descriptor?.key === selectedFeatureRecord?.key || isMultiSelected) ? (() => {
                                  const fan = labelFanOffset(index);
                                  return (
                                    <g transform={`translate(${labelPoint.x} ${labelPoint.y}) scale(${plottingInverseZoom})`}>
                                      <text x={fan.x} y={fan.y} textAnchor="middle" className="cad-svg-label">
                                        BLD-{index + 1}
                                      </text>
                                    </g>
                                  );
                                })() : null}
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
                          const selectedVertexEditable =
                            activeTool === "select" &&
                            action === "update" &&
                            editorTarget !== "boundary" &&
                            Boolean(selectedGeometry);
                          const selectedVertexDragging = selectedVertexDragRef.current === index && isDraggingSelectedVertex;
                          return (
                            <g key={`pt-${index}`} transform={`translate(${projected.x} ${projected.y}) scale(${plottingInverseZoom})`}>
                              <circle
                                r="4.5"
                                className={`cad-svg-vertex${selectedVertexEditable ? " cad-svg-vertex--editable" : ""}${selectedVertexDragging ? " cad-svg-vertex--dragging" : ""}`}
                              />
                            </g>
                          );
                        })}
                        {draftingAssist.ortho && plottingPoints.length > 0 && plottingHoverPoint && (
                          <line
                            x1={plottingViewport.project(plottingPoints[plottingPoints.length - 1]).x}
                            y1={plottingViewport.project(plottingPoints[plottingPoints.length - 1]).y}
                            x2={plottingViewport.project(plottingHoverPoint).x}
                            y2={plottingViewport.project(plottingHoverPoint).y}
                            stroke="#9ca3af"
                            strokeDasharray="4,4"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                        {plottingSnapState && draftingAssist.snap && (
                          <g className="cad-snap-marker" transform={`translate(${plottingSnapState.x} ${plottingSnapState.y}) scale(${plottingInverseZoom})`}>
                            {plottingSnapState.type === "endpoint" && (
                              <rect
                                x={-6}
                                y={-6}
                                width="12"
                                height="12"
                                fill="none"
                                stroke="#22c55e"
                                strokeWidth="2"
                              />
                            )}
                            {plottingSnapState.type === "midpoint" && (
                              <polygon
                                points="0,-7 -7,5 7,5"
                                fill="none"
                                stroke="#22c55e"
                                strokeWidth="2"
                              />
                            )}
                            {plottingSnapState.type === "intersection" && (
                              <g stroke="#22c55e" strokeWidth="2">
                                <line x1={-6} y1={-6} x2={6} y2={6} />
                                <line x1={6} y1={-6} x2={-6} y2={6} />
                              </g>
                            )}
                            <text
                              x={10}
                              y={4}
                              className="cad-snap-tooltip cad-svg-halo-text"
                              fill="#22c55e"
                              fontSize="10"
                              fontWeight="bold"
                            >
                              {plottingSnapState.label}
                            </text>
                          </g>
                        )}
                        {plottingPreviewGeometry?.type === "LineString" && draftingAssist.measure ? (
                          <polyline
                            points={pointsToSvg((plottingPreviewGeometry.coordinates || []) as number[][], plottingViewport.project)}
                            className="cad-svg-preview"
                          />
                        ) : null}
                        {roadWidthPreviewLines ? (
                          <g className="cad-svg-road-width-preview">
                            <polyline points={offsetPointsToSvg(roadWidthPreviewLines.left)} className="cad-svg-road-width-edge" />
                            <polyline points={offsetPointsToSvg(roadWidthPreviewLines.right)} className="cad-svg-road-width-edge" />
                          </g>
                        ) : null}
                        {plottingPreviewGeometry?.type === "Polygon" && Array.isArray(plottingPreviewGeometry.coordinates?.[0]) && draftingAssist.measure ? (
                          <polygon
                            points={pointsToSvg(plottingPreviewGeometry.coordinates[0] as number[][], plottingViewport.project)}
                            className="cad-svg-preview cad-svg-preview--polygon"
                          />
                        ) : null}
                        {plottingMeasureSummary && draftingAssist.measure ? (
                          <g
                            className="cad-measure-callout"
                            transform={`translate(${plottingMeasureSummary.labelX} ${plottingMeasureSummary.labelY}) scale(${plottingInverseZoom})`}
                          >
                            <rect
                              x={-58}
                              y={-18}
                              width="116"
                              height="24"
                              rx="12"
                              className="cad-measure-box"
                            />
                            <text x={0} y={-2} textAnchor="middle" className="cad-measure-label">
                              {formatLength(plottingMeasureSummary.segment)}
                            </text>
                          </g>
                        ) : null}
                      </g> {/* Close panned/zoomed group */}
                    </g> {/* Close viewport clip group */}

                    {/* AutoCAD UCS Coordinate Axis Icon (X-Y Axis) - fixed in map viewport bottom-left */}
                    <g transform={`translate(22, ${plottingViewportBoxHeight - 22})`} className="cad-svg-ucs">
                      <line x1="0" y1="0" x2="35" y2="0" stroke="#94a3b8" strokeWidth="1.5" />
                      <line x1="0" y1="0" x2="0" y2="-35" stroke="#94a3b8" strokeWidth="1.5" />
                      <text x="39" y="3" fill="#64748b" fontSize="9" fontWeight="bold">X</text>
                      <text x="-3" y="-39" fill="#64748b" fontSize="9" fontWeight="bold">Y</text>
                      <circle cx="0" cy="0" r="1.8" fill="#94a3b8" />
                    </g>

                    {/* Static North Arrow Symbol inside map viewport */}
                    <g transform={`translate(${plottingViewportBoxWidth - 40}, 45)`} className={`cad-north-arrow cad-north-arrow--${northArrowColor}`}>
                      <line x1="0" y1="-25" x2="0" y2="25" strokeWidth="1.8" />
                      <polygon points="0,-25 -5,-8 0,-13 5,-8" />
                      <text x="0" y="-29" textAnchor="middle" fontSize="11" fontWeight="bold" fontFamily="monospace">N</text>
                    </g>
                  </g> {/* Close viewport frame translate group */}

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

                  {/* AutoCAD Full-screen Snap-aligned Crosshairs constrained to map viewport */}
                  {screenCursor && basemapMode === "plotting" && (
                    <g className="cad-crosshair">
                      <line x1={plottingViewportX} y1={screenCursor.y} x2={plottingViewportX + plottingViewportBoxWidth} y2={screenCursor.y} />
                      <line x1={screenCursor.x} y1={plottingViewportY} x2={screenCursor.x} y2={plottingViewportY + plottingViewportBoxHeight} />
                      <rect x={screenCursor.x - 5} y={screenCursor.y - 5} width="10" height="10" />
                    </g>
                  )}

                  {/* AutoCAD Dynamic Input Tooltip near cursor */}
                  {screenCursor && basemapMode === "plotting" && (
                    <g className="cad-dynamic-input" transform={`translate(${screenCursor.x + 14}, ${screenCursor.y + 14})`}>
                      <rect x="0" y="0" width="208" height="42" rx="4" className="cad-dyn-bg" />
                      <text x="8" y="16" className="cad-dyn-text">
                        {plottingPoints.length > 0 && plottingHoverPoint
                          ? `Len: ${formatLength(lineLengthMeters([plottingPoints[plottingPoints.length - 1], plottingHoverPoint]))}`
                          : "Specify start point"}
                      </text>
                      <text x="8" y="32" className="cad-dyn-text">
                        {plottingPoints.length > 0 && plottingHoverPoint
                          ? `Angle: ${(() => {
                              const lastPt = plottingPoints[plottingPoints.length - 1];
                              const lastProj = plottingViewport.project(lastPt);
                              const currProj = plottingViewport.project(plottingHoverPoint);
                              const dx = currProj.x - lastProj.x;
                              const dy = lastProj.y - currProj.y;
                              let angleRad = Math.atan2(dy, dx);
                              let angleDeg = (angleRad * 180) / Math.PI;
                              if (angleDeg < 0) angleDeg += 360;
                              return angleDeg.toFixed(1);
                            })()}°`
                          : `${cursorDisplay?.compact || ""}`}
                      </text>
                    </g>
                  )}
                </svg>
                {false ? <div className="cad-plotting-hud" aria-hidden="true">
                  <div className="cad-plotting-hud-card">
                    <span>Coordinate system</span>
                    <strong>{getCoordinateSystemName(coordinateSystem || "wgs84")}</strong>
                  </div>
                  <div className="cad-plotting-hud-card">
                    <span>Cursor</span>
                    <strong>{cursorDisplay?.compact || "Move across the sheet"}</strong>
                  </div>
                  <div className="cad-plotting-hud-card">
                    <span>Selection</span>
                    <strong>{selectedFeatureRecord?.label || "No active feature"}</strong>
                  </div>
                  <div className="cad-plotting-hud-card">
                    <span>Geometry</span>
                    <strong>
                      {activeMetrics
                        ? `${activeMetrics?.geometryType ?? "Geometry"} · ${activeMetrics?.vertices ?? 0} pts`
                        : "Draft or select a feature"}
                    </strong>
                  </div>
                </div> : null}
              </div>
            ) : (
              <div
                key={basemapMode}
                className={`feature-override-map cad-drafting-map cad-drafting-map--${basemapMode}`}
                ref={containerRef}
              />
            )}

            {basemapMode === "plotting" && showTraversePanel && (
              <div className="cad-traverse-panel">
                <div className="cad-traverse-panel-head">
                  <strong>Traverse table &amp; coordinates</strong>
                  <button type="button" onClick={() => setShowTraversePanel(false)} aria-label="Close traverse table">
                    &times;
                  </button>
                </div>
                <div className="cad-traverse-panel-body">
                  <div className="cad-traverse-utm">
                    <span className="cad-traverse-utm-label">UTM co-ordinate of A</span>
                    <span>N {traverseFirstCoordUtm.northing}</span>
                    <span>E {traverseFirstCoordUtm.easting}</span>
                    <span>Origin:- {getCoordinateSystemName(coordinateSystem)}</span>
                    <span className="cad-traverse-muted">Based on {meta.adamawa_topo_sheet_text || "Girei Topo Sheet 197 NE"}</span>
                  </div>
                  <table className="cad-traverse-table">
                    <thead>
                      <tr>
                        <th>From</th>
                        <th>Bearing</th>
                        <th>Length</th>
                        <th>To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traverseRows.length ? (
                        traverseRows.map((row) => (
                          <tr key={row.key}>
                            <td>{row.from}</td>
                            <td>{row.bearing}</td>
                            <td>{row.length}</td>
                            <td>{row.to}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="cad-traverse-muted">No boundary geometry yet</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <p className="cad-traverse-notes">
                    Detail shown met the result of accurate survey. All bearings and distances shown have been computed from
                    registered co-ordinates. Surveyed by - {meta.surveyor_name || "Staff Surveyor"}. Plan prepared by Office of
                    the Surveyor General {meta.state_text || "Adamawa"} State.
                  </p>
                </div>
              </div>
            )}

            {!showLeftSidebar && (
              <button
                type="button"
                className="cad-floating-tab cad-floating-tab--left"
                onClick={() => setShowLeftSidebar(true)}
                title="Show setup tools"
              >
                <span className="cad-floating-tab-arrow">&gt;</span>
                <span className="cad-floating-tab-text">Setup</span>
              </button>
            )}
            {!showRightSidebar && (
              <button
                type="button"
                className="cad-floating-tab cad-floating-tab--right"
                onClick={() => setShowRightSidebar(true)}
                title="Show review inspector"
              >
                <span className="cad-floating-tab-arrow">&lt;</span>
                <span className="cad-floating-tab-text">Review</span>
              </button>
            )}
          </div>
            <div className="cad-status-bar">
              <span className="cad-status-chip cad-status-chip--prompt">
                <strong>{activeCommandLabel}</strong> | {formatEditorTargetLabel(editorTarget)}
              </span>
              <span className="cad-status-chip">
                {cursorDisplay?.compact || "Cursor unavailable"}
              </span>
              <span className="cad-status-chip">
                {basemapMode === "plotting" ? `Plotting ${plottingZoomPercent}` : "Satellite review"}
              </span>
              {activeMetrics ? (
                <span className="cad-status-chip">
                  {activeMetrics.geometryType} | {activeMetrics.vertices} pts | {formatLength(activeMetrics.lengthM || activeMetrics.perimeterM)}
                </span>
              ) : null}
              <button type="button" className={`cad-status-toggle${draftingAssist.snap ? " active" : ""}`} onClick={() => toggleDraftingAssist("snap")}>
                Snap {draftingAssist.snap ? "On" : "Off"}
              </button>
              <button type="button" className={`cad-status-toggle${draftingAssist.ortho ? " active" : ""}`} onClick={() => toggleDraftingAssist("ortho")}>
                Ortho {draftingAssist.ortho ? "On" : "Off"}
              </button>
              <button type="button" className={`cad-status-toggle${draftingAssist.measure ? " active" : ""}`} onClick={() => toggleDraftingAssist("measure")}>
                Measure {draftingAssist.measure ? "On" : "Off"}
              </button>
              {basemapMode === "plotting" && plottingSnapLabel ? <span className="cad-status-chip">Snap target | {plottingSnapLabel}</span> : null}
            </div>
          </div>

          <aside className="cad-editor-inspector" style={{ display: showRightSidebar ? "block" : "none" }}>
            <section className="cad-panel cad-panel--command">
              <div className="cad-panel-head" style={{ position: "relative" }}>
                <strong>Command</strong>
                <span>Open the review tools only when you need them.</span>
                <button
                  type="button"
                  className="cad-panel-close-btn"
                  onClick={() => setShowRightSidebar(false)}
                  title="Collapse panel"
                >
                  &times;
                </button>
              </div>
              <div className="cad-command-center-grid">
                <div className="cad-command-center-card">
                  <span>Current command</span>
                  <strong>{activeCommandLabel}</strong>
                  <small>{formatEditorTargetLabel(editorTarget)}</small>
                </div>
                <div className="cad-command-center-card">
                  <span>Selection</span>
                  <strong>{selectionHeadline}</strong>
                  <small>{basemapMode === "plotting" ? `Plotting ${plottingZoomPercent}` : "Satellite review"}</small>
                </div>
              </div>
              <div className="cad-command-center-actions">
                <button
                  type="button"
                  className={`cad-command-action${action === "add" ? " active" : ""}`}
                  onClick={startAddFlow}
                  disabled={editorTarget === "boundary"}
                >
                  Add
                </button>
                <button
                  type="button"
                  className={`cad-command-action${action === "update" ? " active" : ""}`}
                  onClick={startUpdateFlow}
                >
                  Modify
                </button>
                <button
                  type="button"
                  className={`cad-command-action cad-command-action--danger${action === "delete" ? " active" : ""}`}
                  onClick={startDeleteFlow}
                  disabled={editorTarget === "boundary"}
                >
                  Delete
                </button>
              </div>
              <div className="cad-command-center-actions cad-command-center-actions--secondary">
                <button type="button" className="cad-command-action" onClick={fitPlotBoundary}>
                  Fit plot
                </button>
                <button type="button" className="cad-command-action" onClick={clearWorkingSelection}>
                  Clear draft
                </button>
                {basemapMode === "plotting" ? (
                  <button
                    type="button"
                    className={`cad-command-action${showTraversePanel ? " active" : ""}`}
                    onClick={() => setShowTraversePanel((value) => !value)}
                  >
                    Traverse
                  </button>
                ) : null}
              </div>
              {editorTarget === "boundary" ? (
                <div className="cad-command-center-note">
                  Boundary geometry is protected from add and delete commands. Switch to Boundary only when you intend to adjust parcel vertices.
                </div>
              ) : null}
              <div className="cad-command-center-primary">
                <button
                  type="button"
                  className={`cad-command-primary${action === "delete" ? " danger" : ""}`}
                  onClick={handleSave}
                  disabled={!canSave || savingAction}
                >
                  {savingAction ? "Saving..." : primaryActionLabel}
                </button>
              </div>
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Selection</strong>
                <span>
                  {selectedObjectCount > 1
                    ? `${selectedObjectCount} objects selected`
                    : selectedFeatureRecord
                      ? "Selected feature summary"
                      : "Select a feature to review it here"}
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
                      <div className="cad-property-row">
                        <span>Coord system</span>
                        <strong>{getCoordinateSystemName(coordinateSystem || "wgs84")}</strong>
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
                <p className="cad-empty-state">Select an object from the register or canvas to open its survey properties.</p>
              )}
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Geometry</strong>
                <span>{hasSelectedGeometry ? "Selection ready for command execution" : "Live drafting measurements and parcel scale"}</span>
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
                <p className="cad-empty-state">Select a detected feature or start drawing to see geometry measurements.</p>
              )}
              {hasSelectedGeometry ? (
                <div className="cad-selection-summary">
                  <strong>Selected target</strong>
                  <span>
                    {editorTarget === "boundary"
                      ? "Boundary selected. Drag a parcel vertex in plotting view to update the boundary."
                      : `${formatEditorTargetLabel(editorTarget)} selected. Use Modify Selected to adjust it or Delete Selected to remove it.`}
                  </span>
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
                <div className="cad-warning">
                  <strong>Delete mode</strong>
                  <span>Delete does not happen immediately. You will be asked to confirm before anything is removed.</span>
                </div>
              ) : null}
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Coordinate Register</strong>
                <span>First eight vertices in the active coordinate system</span>
              </div>
              {selectedCoordinateRows.length ? (
                <div className="cad-coordinate-table-wrap">
                  <table className="cad-coordinate-table">
                    <thead>
                      <tr>
                        <th>Point</th>
                        <th>{coordinateAxisLabels.xShort}</th>
                        <th>{coordinateAxisLabels.yShort}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCoordinateRows.map((coord) => (
                        <tr key={coord.key}>
                          <td>{coord.label}</td>
                          <td>{coord.x}</td>
                          <td>{coord.y}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="cad-empty-state">The selected geometry coordinates will appear here.</p>
              )}
            </section>

            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Survey Precision</strong>
                <span>Drafting assist and snap controls for accurate survey edits</span>
              </div>
              <div className="cad-property-list">
                <div className="cad-property-row">
                  <span>Snap set</span>
                  <strong>{osnapSummary}</strong>
                </div>
                <div className="cad-property-row">
                  <span>Cursor basis</span>
                  <strong>{getCoordinateSystemName(coordinateSystem || "wgs84")}</strong>
                </div>
                <div className="cad-property-row">
                  <span>View</span>
                  <strong>{basemapMode === "plotting" ? `Plotting ${plottingZoomPercent}` : "Satellite"}</strong>
                </div>
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
            <div className="cad-command-input-container">
              {showSuggestions && suggestions.length > 0 && (
                <ul className="cad-command-suggestions">
                  {suggestions.map((suggestion, index) => (
                    <li
                      key={suggestion}
                      className={index === activeSuggestionIndex ? "active" : ""}
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      {suggestion}
                    </li>
                  ))}
                </ul>
              )}
              <input
                value={commandInput}
                onChange={(event) => handleCommandInputChange(event.target.value)}
                onKeyDown={handleCommandKeyDown}
                placeholder="HELP, L, PL, M, E, SNAP, ORTHO..."
                autoComplete="off"
                spellCheck="false"
              />
            </div>
            <button type="button" className="cad-tool-btn" onClick={handleCommandSubmit}>
              Run
            </button>
          </div>
        </div>

        <div className="feature-override-actions cad-editor-actions cad-editor-actions--compact">
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
              disabled={!canSave || savingAction}
            >
              {savingAction ? "Saving..." : primaryActionLabel}
            </button>
          </div>
        </div>
      </div>

      {showEditorHelp && (
        <div className="cad-confirm-overlay cad-help-overlay" role="dialog" aria-modal="true" onClick={() => setShowEditorHelp(false)}>
          <div className="cad-help-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="cad-help-head">
              <div>
                <span>Editor help</span>
                <h3>Use the drawing tools without covering the plot.</h3>
              </div>
              <button type="button" className="cad-icon-btn" onClick={() => setShowEditorHelp(false)} title="Close help">
                <CadIcon name="close" />
              </button>
            </div>
            <div className="cad-help-grid">
              {CAD_EDITOR_HELP_SECTIONS.map((section, index) => (
                <article key={section.title} className="cad-help-card">
                  <span>{`0${index + 1}`}</span>
                  <strong>{section.title}</strong>
                  <p>{section.description}</p>
                </article>
              ))}
            </div>
            <div className="cad-help-footer">
              <strong>Tip:</strong> Keep the plot open, pull in Tools only when needed, and use Inspector only when reviewing a selected object.
            </div>
          </div>
        </div>
      )}

      {pendingSave && (
        <div className="cad-confirm-overlay" role="dialog" aria-modal="true" onClick={cancelPendingSave}>
          <div className="cad-confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>
              {pendingSave.kind === "delete"
                ? "Delete feature?"
                : pendingSave.action === "add"
                  ? "Add feature?"
                  : "Apply change?"}
            </h3>
            <p>
              Do you want to {pendingSaveDescription}
              {pendingSave.kind === "upsert" && pendingSave.featureType === "road" && pendingSave.name
                ? ` "${pendingSave.name}"`
                : ""}
              ?
            </p>
            <div className="cad-confirm-dialog-actions">
              <button type="button" className="btn-outline" onClick={cancelPendingSave} autoFocus>
                No
              </button>
              <button
                type="button"
                className={`btn-primary${pendingSave.kind === "delete" ? " danger" : ""}`}
                onClick={confirmPendingSave}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

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
