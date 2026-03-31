import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
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

  const isStyleReady = useCallback((map: mapboxgl.Map | null) => {
    if (!map) return false;
    try {
      return map.isStyleLoaded();
    } catch {
      return false;
    }
  }, []);

  const importGeometryIntoEditor = useCallback(
    (geometry: any, nextFeatureType: FeatureType, properties?: Record<string, any>) => {
      if (!geometry) return;

      setSelectedGeometry(geometry);
      setSelectedMetrics(getGeometryMetrics(geometry));
      setDraftMetrics(getGeometryMetrics(geometry));
      setFeatureType(nextFeatureType);

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
    const map = mapRef.current;
    if (basemapMode === "plotting") return;
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
    setDraftMetrics(null);
    setSelectedGeometry(null);
    setSelectedMetrics(null);
    setActiveTool("select");
    drawRef.current?.changeMode("simple_select");
  }, []);

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
    (event: ReactMouseEvent<SVGSVGElement>) => {
      const target = event.currentTarget;
      const rect = target.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * plottingViewport.width;
      const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * plottingViewport.height;
      return { x, y };
    },
    [plottingViewport.height, plottingViewport.width]
  );

  const handlePlottingMouseMove = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      if (basemapMode !== "plotting") return;
      const pointer = getPlottingPointer(event);
      const [lng, lat] = plottingViewport.unproject(pointer);
      setCursor({ lng, lat });
    },
    [basemapMode, getPlottingPointer, plottingViewport]
  );

  const handlePlottingCanvasClick = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      if (basemapMode !== "plotting") return;
      if (activeTool === "select") return;
      event.preventDefault();
      const pointer = getPlottingPointer(event);
      const [lng, lat] = plottingViewport.unproject(pointer);
      setPlottingPoints((previous) => [...previous, [lng, lat]]);
    },
    [activeTool, basemapMode, getPlottingPointer, plottingViewport]
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
    (nextFeatureType: FeatureType, feature: any) => {
      importGeometryIntoEditor(feature?.geometry, nextFeatureType, feature?.properties || {});
      setActiveTool("select");
    },
    [importGeometryIntoEditor]
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
    if (!feature) return;
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
              onClick={() => setEditorTool("select")}
            >
              Select
            </button>
            <button
              type="button"
              className={`cad-tool-btn ${activeTool === "draw_line_string" ? "active" : ""}`}
              onClick={() => setEditorTool("draw_line_string")}
            >
              Line
            </button>
            <button
              type="button"
              className={`cad-tool-btn ${activeTool === "draw_polygon" ? "active" : ""}`}
              onClick={() => setEditorTool("draw_polygon")}
            >
              Polygon
            </button>
            <button type="button" className="cad-tool-btn" onClick={() => setEditorTool(suggestedTool)}>
              Match {suggestedToolLabel}
            </button>
          </div>

          <div className="cad-toolbar-group">
            <span className="cad-toolbar-label">View</span>
            <button type="button" className="cad-tool-btn" onClick={fitPlotBoundary}>
              Fit Plot
            </button>
            <button type="button" className="cad-tool-btn" onClick={clearWorkingSelection}>
              Clear Draft
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
              Active operation: <strong>{action}</strong> on <strong>{featureType}</strong>
            </span>
          </div>
        </div>

        <div className="cad-editor-body">
          <aside className="cad-editor-sidebar">
            <section className="cad-panel">
              <div className="cad-panel-head">
                <strong>Feature Setup</strong>
                <span>Choose what you are editing</span>
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
                <div className="field">
                  <label>Action</label>
                  <select value={action} onChange={(event) => setAction(event.target.value as FeatureAction)}>
                    <option value="add">Add</option>
                    <option value="update">Update</option>
                    <option value="delete">Delete</option>
                  </select>
                </div>
                {featureType === "road" && action !== "delete" && (
                  <div className="field wide">
                    <label>Road Name</label>
                    <input value={roadName} onChange={(event) => setRoadName(event.target.value)} placeholder="e.g. Access Road A" />
                  </div>
                )}
                {featureType === "road" && action === "add" && (
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
                  Roads, rivers, and fences use line drafting. Buildings use polygon drafting. Right-click detected features to switch directly into update/delete flow.
                </div>
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
                <strong>Selected Geometry</strong>
                <span>Live drafting measurements</span>
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
              </div>
            </div>
            {basemapMode === "plotting" ? (
              <div className="feature-override-map cad-plotting-stage" ref={plottingStageRef}>
                <svg
                  className="cad-plotting-svg"
                  viewBox={`0 0 ${plottingViewport.width} ${plottingViewport.height}`}
                  onMouseMove={handlePlottingMouseMove}
                  onMouseLeave={() => setCursor(null)}
                  onClick={handlePlottingCanvasClick}
                  onDoubleClick={handlePlottingCanvasDoubleClick}
                >
                  <rect x="0" y="0" width={plottingViewport.width} height={plottingViewport.height} className="cad-plot-bg" />
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
                      return (
                        <g key={`road-${index}`} onClick={() => handlePlottingFeatureSelect("road", feature)}>
                          <polyline
                            points={pointsToSvg(geometry.coordinates || [], plottingViewport.project)}
                            className="cad-svg-feature cad-svg-feature--road"
                          />
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
                      return (
                        <polyline
                          key={`river-${index}`}
                          points={pointsToSvg(geometry.coordinates || [], plottingViewport.project)}
                          className="cad-svg-feature cad-svg-feature--river"
                          onClick={() => handlePlottingFeatureSelect("river", feature)}
                        />
                      );
                    })}
                  {layerVisibility.fence &&
                    featureCollections.fence.features.map((feature, index) => {
                      const geometry = feature?.geometry;
                      if (geometry?.type !== "LineString") return null;
                      return (
                        <polyline
                          key={`fence-${index}`}
                          points={pointsToSvg(geometry.coordinates || [], plottingViewport.project)}
                          className="cad-svg-feature cad-svg-feature--fence"
                          onClick={() => handlePlottingFeatureSelect("fence", feature)}
                        />
                      );
                    })}
                  {layerVisibility.building &&
                    featureCollections.building.features.map((feature, index) => {
                      const geometry = feature?.geometry;
                      const ring = Array.isArray(geometry?.coordinates?.[0]) ? geometry.coordinates[0] : null;
                      if (!ring) return null;
                      const labelPoint = getFeatureLabelPoint(geometry, plottingViewport.project);
                      return (
                        <g key={`building-${index}`} onClick={() => handlePlottingFeatureSelect("building", feature)}>
                          <polygon
                            points={pointsToSvg(ring, plottingViewport.project)}
                            className="cad-svg-feature cad-svg-feature--building"
                          />
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
              <span>
                Geometry:{" "}
                {activeMetrics
                  ? `${activeMetrics.geometryType} | ${activeMetrics.vertices} pts | ${formatLength(activeMetrics.lengthM || activeMetrics.perimeterM)}`
                  : "None"}
              </span>
            </div>
          </div>
        </div>

        <div className="feature-override-actions cad-editor-actions">
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Save Feature Changes
          </button>
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
              setAction("update");
              setMenu((current) => ({ ...current, visible: false }));
            }}
          >
            Set Update
          </button>
          <button
            onClick={() => {
              setAction("delete");
              if (selectedGeometry) {
                onSave({
                  feature_type: featureType,
                  action: "delete",
                  geojson: selectedGeometry,
                });
              }
              setMenu((current) => ({ ...current, visible: false }));
            }}
          >
            Set Delete
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
