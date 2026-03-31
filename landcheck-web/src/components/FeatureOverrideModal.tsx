import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const toolForFeatureType = (type: FeatureType): EditorTool => (type === "building" ? "draw_polygon" : "draw_line_string");

const layerIds: Record<FeatureType | "boundary", string[]> = {
  road: ["roads-line"],
  building: ["buildings-fill", "buildings-line"],
  river: ["rivers-line"],
  fence: ["fences-line"],
  boundary: ["plot-boundary-line"],
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

  const activeMetrics = useMemo(() => draftMetrics || selectedMetrics, [draftMetrics, selectedMetrics]);

  const isStyleReady = useCallback((map: mapboxgl.Map | null) => {
    if (!map) return false;
    try {
      return map.isStyleLoaded();
    } catch {
      return false;
    }
  }, []);

  const applyBasemapMode = useCallback((map: mapboxgl.Map, mode: BasemapMode) => {
    if (!isStyleReady(map)) return;
    const plotting = mode === "plotting";

    if (map.getLayer("cad-mask-fill")) {
      map.setPaintProperty("cad-mask-fill", "fill-opacity", plotting ? 0.96 : 0);
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

  const fitPlotBoundary = useCallback(() => {
    const map = mapRef.current;
    if (!map || !plotCoords?.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    plotCoords.forEach(([lng, lat]) => bounds.extend([lng, lat]));
    map.fitBounds(bounds, { padding: 48, duration: 300 });
  }, [plotCoords]);

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
    const draw = drawRef.current;
    if (!draw) return;
    if (tool === "select") {
      draw.changeMode("simple_select");
    } else {
      draw.changeMode(tool as any);
    }
    setActiveTool(tool);
  }, []);

  const clearWorkingSelection = useCallback(() => {
    drawRef.current?.deleteAll();
    activeDrawFeatureId.current = null;
    setDraftMetrics(null);
    setSelectedGeometry(null);
    setSelectedMetrics(null);
    setActiveTool("select");
    drawRef.current?.changeMode("simple_select");
  }, []);

  useEffect(() => {
    if (!isOpen || mapRef.current || !containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
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

    const loadFeatures = async () => {
      if (!plotId) return;
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/plots/${plotId}/features/geojson`);
        if (!res.ok) return;
        const data = await res.json();

        const roadsData = data.roads || { type: "FeatureCollection", features: [] };
        const buildingsData = data.buildings || { type: "FeatureCollection", features: [] };
        const riversData = data.rivers || { type: "FeatureCollection", features: [] };
        const fencesData = data.fences || { type: "FeatureCollection", features: [] };

        setFeatureInventory({
          road: Array.isArray(roadsData.features) ? roadsData.features.length : 0,
          building: Array.isArray(buildingsData.features) ? buildingsData.features.length : 0,
          river: Array.isArray(riversData.features) ? riversData.features.length : 0,
          fence: Array.isArray(fencesData.features) ? fencesData.features.length : 0,
        });

        if (!map.getSource("roads-src")) {
          map.addSource("roads-src", { type: "geojson", data: roadsData });
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
          map.addSource("buildings-src", { type: "geojson", data: buildingsData });
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
          map.addSource("rivers-src", { type: "geojson", data: riversData });
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
          map.addSource("fences-src", { type: "geojson", data: fencesData });
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
      } catch {
        // keep modal usable even if feature overlay fetch fails
      }
    };

    const selectFeature = (nextFeatureType: FeatureType) => (event: mapboxgl.MapLayerMouseEvent) => {
      if (!drawRef.current || !event.features?.length) return;
      const sourceFeature = event.features[0];
      if (!sourceFeature.geometry) return;

      drawRef.current.deleteAll();
      const drawFeature = {
        type: "Feature" as const,
        properties: {
          imported_from_detection: true,
        },
        geometry: sourceFeature.geometry as any,
      };
      const added = drawRef.current.add(drawFeature as any);
      const nextId = Array.isArray(added) ? added[0] : added;
      activeDrawFeatureId.current = nextId ? String(nextId) : null;
      if (nextId) {
        try {
          drawRef.current.changeMode("direct_select", { featureId: String(nextId) } as any);
        } catch {
          drawRef.current.changeMode("simple_select");
        }
      }

      setActiveTool("select");
      setSelectedGeometry(sourceFeature.geometry);
      setSelectedMetrics(getGeometryMetrics(sourceFeature.geometry));
      setDraftMetrics(getGeometryMetrics(sourceFeature.geometry));
      setFeatureType(nextFeatureType);

      if (nextFeatureType === "road") {
        const nextName = typeof (sourceFeature.properties as any)?.name === "string" ? String((sourceFeature.properties as any).name) : "";
        const nextWidth = String((sourceFeature.properties as any)?.width_m || "");
        setRoadName(nextName);
        if (nextWidth && ["2", "4", "6", "8", "10", "12", "15", "20", "30"].includes(nextWidth)) {
          setRoadWidth(nextWidth as Props["roadWidth"]);
        }
      }

      if (action === "add") {
        setAction("update");
      }
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

      loadFeatures();
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
  }, [action, applyBasemapMode, applyLayerVisibility, basemapMode, ensureCadOverlay, fitPlotBoundary, isOpen, layerVisibility, plotCoords, plotId, setAction, setFeatureType, setRoadName, setRoadWidth, syncDraftFromDraw]);

  useEffect(() => {
    if (!isOpen) return;
    const map = mapRef.current;
    if (!map) return;
    applyLayerVisibility(map, layerVisibility);
  }, [applyLayerVisibility, isOpen, layerVisibility]);

  useEffect(() => {
    if (!isOpen) return;
    const map = mapRef.current;
    if (!map) return;
    ensureCadOverlay(map);
    applyBasemapMode(map, basemapMode);
  }, [applyBasemapMode, basemapMode, ensureCadOverlay, isOpen]);

  const handleSave = () => {
    const draw = drawRef.current;
    if (!draw) return;
    const data = draw.getAll();
    let feature = data.features[data.features.length - 1];
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

          <div className="cad-editor-canvas">
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
            <div className="feature-override-map cad-drafting-map" ref={containerRef} />
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
