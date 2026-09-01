import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/client";
import SurveyLoadingAnimation from "../SurveyLoadingAnimation";
import { loadMapboxGl, MAPBOX_TOKEN } from "../../utils/mapboxLoader";
import { isProjectedCoordinateSystem, mercatorToWGS84, toWGS84 } from "../../utils/coordinateConverter";
import type { GeoreferenceFeature, GeoreferenceSession, GeoreferenceTransform } from "../../types/surveyGeoreference";
import {
  getRasterPixelFromStageClick,
  getRasterStageMetrics,
  projectRasterPixelToStage,
  type RasterStageMetrics,
} from "../../utils/georeferenceRasterStage";

type DraftTool = "point" | "line" | "polygon";

type Props = {
  sidebar: ReactNode;
  session: GeoreferenceSession;
  rasterObjectUrl: string | null;
  features: GeoreferenceFeature[];
  saving: boolean;
  onFeaturesChange: (features: GeoreferenceFeature[]) => void;
  onSaveFeatures: () => void | Promise<void>;
  onBack: () => void;
  onContinue: () => void;
};

const toolLabels: Record<DraftTool, string> = {
  point: "Stake point",
  line: "Alignment / line",
  polygon: "Parcel boundary",
};

// Same "remembered until tomorrow" quota flag pattern as CoordinateInput.tsx's AI features -
// best-effort only (a private window or cleared storage just means this specific reminder doesn't
// survive a refresh; the server's own daily cap still enforces the real limit).
const AI_DIGITIZE_QUOTA_EXHAUSTED_KEY = "georeference-ai-digitize-quota-exhausted-date";

const MIN_STAGE_ZOOM = 1;
const MAX_STAGE_ZOOM = 4;
const STAGE_ZOOM_STEP = 0.25;

const buildFeatureId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `georef_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const formatGridCoordinate = (value: number, projected: boolean) =>
  Number.isFinite(value) ? value.toLocaleString(undefined, { minimumFractionDigits: projected ? 3 : 6, maximumFractionDigits: projected ? 3 : 6 }) : "--";

const formatWgs84Coordinate = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 }) : "--";

const describeFeatureGeometry = (feature: GeoreferenceFeature) => {
  if (feature.feature_type === "point") return "Point";
  if (feature.feature_type === "line") return `${feature.pixels.length} vertices`;
  return `${feature.pixels.length} boundary vertices`;
};

function SurveyPlanGeoreferenceWorkspaceStep({
  sidebar,
  session,
  rasterObjectUrl,
  features,
  saving,
  onFeaturesChange,
  onSaveFeatures,
  onBack,
  onContinue,
}: Props) {
  const imageViewportRef = useRef<HTMLDivElement | null>(null);
  const imageStageRef = useRef<HTMLDivElement | null>(null);
  const rasterImageRef = useRef<HTMLImageElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
  const suppressNextStageClickRef = useRef(false);
  const suppressNextAutoSelectRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [tool, setTool] = useState<DraftTool>("polygon");
  const [draftLabel, setDraftLabel] = useState("Primary parcel");
  const [draftPixels, setDraftPixels] = useState<{ x: number; y: number }[]>([]);
  const [stageMetrics, setStageMetrics] = useState<RasterStageMetrics | null>(null);
  const [imageZoom, setImageZoom] = useState(MIN_STAGE_ZOOM);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [draggingStage, setDraggingStage] = useState(false);
  const [aiDigitizing, setAiDigitizing] = useState(false);
  const [aiDigitizeQuotaExhausted, setAiDigitizeQuotaExhausted] = useState(() => {
    try {
      return window.localStorage.getItem(AI_DIGITIZE_QUOTA_EXHAUSTED_KEY) === new Date().toDateString();
    } catch {
      return false;
    }
  });
  const overlayRasterUrl = session?.overlay?.raster_url
    ? (/^https?:\/\//i.test(session.overlay.raster_url) ? session.overlay.raster_url : `${api.defaults.baseURL || ""}${session.overlay.raster_url}`)
    : rasterObjectUrl;
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [cursorSample, setCursorSample] = useState<{
    pixelX: number;
    pixelY: number;
    targetX: number;
    targetY: number;
    lng: number;
    lat: number;
    leftPercent: number;
    topPercent: number;
  } | null>(null);

  const transform = session.transform as GeoreferenceTransform;
  type PreviewFeature = GeoreferenceFeature & { source: "draft" | "saved" };
  const effectiveTransformSystem =
    transform.resolved_coordinate_system ?? transform.target_coordinate_system;
  const projectedGroundSystem = isProjectedCoordinateSystem(effectiveTransformSystem);
  const coordinateXLabel = projectedGroundSystem ? "Easting (m)" : "Longitude";
  const coordinateYLabel = projectedGroundSystem ? "Northing (m)" : "Latitude";

  const clampStagePan = (pan: { x: number; y: number }, zoom = imageZoom) => {
    if (!stageMetrics || zoom <= MIN_STAGE_ZOOM) return { x: 0, y: 0 };
    const maxX = (stageMetrics.containerWidth * (zoom - 1)) / 2;
    const maxY = (stageMetrics.containerHeight * (zoom - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, pan.x)),
      y: Math.max(-maxY, Math.min(maxY, pan.y)),
    };
  };

  const updateStageZoom = (nextZoom: number) => {
    const normalizedZoom = Math.max(MIN_STAGE_ZOOM, Math.min(MAX_STAGE_ZOOM, Number(nextZoom.toFixed(2))));
    setImageZoom(normalizedZoom);
    setImagePan((current) => clampStagePan(normalizedZoom <= MIN_STAGE_ZOOM ? { x: 0, y: 0 } : current, normalizedZoom));
    if (normalizedZoom <= MIN_STAGE_ZOOM) {
      setDraggingStage(false);
      dragStateRef.current = null;
    }
  };

  const updateStageZoomAtClientPoint = (nextZoom: number, clientX: number, clientY: number) => {
    const normalizedZoom = Math.max(MIN_STAGE_ZOOM, Math.min(MAX_STAGE_ZOOM, Number(nextZoom.toFixed(2))));
    if (
      !stageMetrics ||
      !imageStageRef.current ||
      !rasterImageRef.current ||
      !imageViewportRef.current
    ) {
      updateStageZoom(normalizedZoom);
      return;
    }
    const pixel = getRasterPixelFromStageClick(
      imageStageRef.current,
      rasterImageRef.current,
      session.source_width,
      session.source_height,
      clientX,
      clientY,
    );
    if (!pixel) {
      updateStageZoom(normalizedZoom);
      return;
    }
    const stagePosition = projectRasterPixelToStage(pixel.pixelX, pixel.pixelY, stageMetrics);
    if (!stagePosition) {
      updateStageZoom(normalizedZoom);
      return;
    }
    const viewportRect = imageViewportRef.current.getBoundingClientRect();
    const screenX = clientX - viewportRect.left;
    const screenY = clientY - viewportRect.top;
    const centerX = stageMetrics.containerWidth / 2;
    const centerY = stageMetrics.containerHeight / 2;
    const nextPan = clampStagePan(
      {
        x: screenX - centerX - (stagePosition.leftPx - centerX) * normalizedZoom,
        y: screenY - centerY - (stagePosition.topPx - centerY) * normalizedZoom,
      },
      normalizedZoom,
    );
    setImageZoom(normalizedZoom);
    setImagePan(nextPan);
    if (normalizedZoom <= MIN_STAGE_ZOOM) {
      setDraggingStage(false);
      dragStateRef.current = null;
    }
  };

  const applyPixelTransform = (pixelX: number, pixelY: number) => {
    const homography = Array.isArray(transform.homography) ? transform.homography : null;
    const mapHomography = Array.isArray(transform.map_homography) ? transform.map_homography : null;
    let targetX = 0;
    let targetY = 0;
    let usedHomography = false;
    if (homography && homography.length === 9) {
      const denominator = homography[6] * pixelX + homography[7] * pixelY + homography[8];
      if (Math.abs(denominator) > 1e-9) {
        targetX = (homography[0] * pixelX + homography[1] * pixelY + homography[2]) / denominator;
        targetY = (homography[3] * pixelX + homography[4] * pixelY + homography[5]) / denominator;
        usedHomography = Number.isFinite(targetX) && Number.isFinite(targetY);
      }
    }
    if (!usedHomography) {
      const coeffX = transform.coefficients.x;
      const coeffY = transform.coefficients.y;
      targetX = coeffX[0] + coeffX[1] * pixelX + coeffX[2] * pixelY;
      targetY = coeffY[0] + coeffY[1] * pixelX + coeffY[2] * pixelY;
    }

    let lng = 0;
    let lat = 0;
    let usedMapTransform = false;
    if (mapHomography && mapHomography.length === 9) {
      const denominator = mapHomography[6] * pixelX + mapHomography[7] * pixelY + mapHomography[8];
      if (Math.abs(denominator) > 1e-9) {
        const mercatorX = (mapHomography[0] * pixelX + mapHomography[1] * pixelY + mapHomography[2]) / denominator;
        const mercatorY = (mapHomography[3] * pixelX + mapHomography[4] * pixelY + mapHomography[5]) / denominator;
        if (Number.isFinite(mercatorX) && Number.isFinite(mercatorY)) {
          [lng, lat] = mercatorToWGS84(mercatorX, mercatorY);
          usedMapTransform = Number.isFinite(lng) && Number.isFinite(lat);
        }
      }
    }
    if (!usedMapTransform && transform.map_coefficients?.x?.length === 3 && transform.map_coefficients?.y?.length === 3) {
      const coeffX = transform.map_coefficients.x;
      const coeffY = transform.map_coefficients.y;
      const mercatorX = coeffX[0] + coeffX[1] * pixelX + coeffX[2] * pixelY;
      const mercatorY = coeffY[0] + coeffY[1] * pixelX + coeffY[2] * pixelY;
      [lng, lat] = mercatorToWGS84(mercatorX, mercatorY);
      usedMapTransform = Number.isFinite(lng) && Number.isFinite(lat);
    }
    if (!usedMapTransform) {
      [lng, lat] = toWGS84(targetX, targetY, effectiveTransformSystem);
    }
    return {
      target: [Number(targetX.toFixed(6)), Number(targetY.toFixed(6))] as [number, number],
      wgs84: [Number(lng.toFixed(8)), Number(lat.toFixed(8))] as [number, number],
    };
  };

  const previewFeatures = useMemo(() => {
    const live: PreviewFeature[] = features.map((feature) => ({
      ...feature,
      source: "saved" as const,
    }));
    if (!draftPixels.length) return live;
    const targetCoordinates: [number, number][] = [];
    const wgs84Coordinates: [number, number][] = [];
    draftPixels.forEach((point) => {
      const transformed = applyPixelTransform(point.x, point.y);
      targetCoordinates.push(transformed.target);
      wgs84Coordinates.push(transformed.wgs84);
    });
    if (tool === "polygon" && wgs84Coordinates.length >= 3) {
      targetCoordinates.push(targetCoordinates[0]);
      wgs84Coordinates.push(wgs84Coordinates[0]);
    }
    live.push({
      id: "draft",
      label: draftLabel || toolLabels[tool],
      feature_type: tool,
      is_primary: tool === "polygon",
      pixels: draftPixels,
      target_coordinates: targetCoordinates,
      wgs84_coordinates: wgs84Coordinates,
      source: "draft" as const,
    });
    return live;
  }, [draftLabel, draftPixels, features, tool]);

  useEffect(() => {
    if (!previewFeatures.length) {
      setSelectedFeatureId(null);
      return;
    }
    if (selectedFeatureId && previewFeatures.some((feature) => feature.id === selectedFeatureId)) return;
    if (suppressNextAutoSelectRef.current) {
      // AI Digitize just added its draft feature(s) - the surveyor needs an unobstructed view of
      // the whole raster to visually compare the AI's boundary against the plan first, not the
      // coordinate float panel popping up and covering it before they've even looked. One-shot:
      // the very next manual selection (or draw) behaves exactly as before.
      suppressNextAutoSelectRef.current = false;
      return;
    }
    const draftFeature = previewFeatures.find((feature) => feature.source === "draft");
    setSelectedFeatureId(draftFeature?.id || previewFeatures[0]?.id || null);
  }, [previewFeatures, selectedFeatureId]);

  useEffect(() => {
    setImageZoom(MIN_STAGE_ZOOM);
    setImagePan({ x: 0, y: 0 });
    setDraggingStage(false);
    dragStateRef.current = null;
    suppressNextStageClickRef.current = false;
  }, [session.id, rasterObjectUrl]);

  const mapFeatureCollection = useMemo(() => {
    const pointFeatures: any[] = [];
    const lineFeatures: any[] = [];
    const polygonFeatures: any[] = [];

    previewFeatures.forEach((feature) => {
      const coords = feature.wgs84_coordinates || [];
      if (!coords.length) return;
      if (feature.feature_type === "point") {
        pointFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: coords[0] },
          properties: { label: feature.label, draft: feature.id === "draft" ? 1 : 0 },
        });
      } else if (feature.feature_type === "line") {
        lineFeatures.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { label: feature.label, draft: feature.id === "draft" ? 1 : 0 },
        });
      } else if (feature.feature_type === "polygon") {
        polygonFeatures.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [coords] },
          properties: { label: feature.label, draft: feature.id === "draft" ? 1 : 0, primary: feature.is_primary ? 1 : 0 },
        });
      }
    });

    return {
      points: { type: "FeatureCollection", features: pointFeatures },
      lines: { type: "FeatureCollection", features: lineFeatures },
      polygons: { type: "FeatureCollection", features: polygonFeatures },
    };
  }, [previewFeatures]);

  useEffect(() => {
    const measure = () => {
      const nextMetrics = getRasterStageMetrics(
        imageStageRef.current,
        rasterImageRef.current,
        session.source_width,
        session.source_height,
      );
      setStageMetrics(nextMetrics);
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    if (imageStageRef.current) resizeObserver.observe(imageStageRef.current);
    if (rasterImageRef.current) resizeObserver.observe(rasterImageRef.current);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [rasterObjectUrl, session.id, session.source_height, session.source_width]);

  useEffect(() => {
    let cancelled = false;
    if (!mapContainerRef.current || mapRef.current) return;
    loadMapboxGl().then((mapboxgl) => {
      if (cancelled || !mapContainerRef.current) return;
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [12.4, 9.2],
        zoom: 5.8,
        accessToken: MAPBOX_TOKEN,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
      map.on("load", () => {
        if (overlayRasterUrl && session.overlay?.corners?.length) {
          map.addSource("georef-raster-workspace", {
            type: "image",
            url: overlayRasterUrl,
            coordinates: session.overlay.corners,
          } as any);
          map.addLayer({
            id: "georef-raster-workspace-layer",
            type: "raster",
            source: "georef-raster-workspace",
            paint: {
              "raster-opacity": 0.82,
              "raster-resampling": "linear",
              "raster-saturation": -0.08,
              "raster-contrast": 0.14,
            },
          });
        }
        map.addSource("georef-polygons", { type: "geojson", data: mapFeatureCollection.polygons as any });
        map.addSource("georef-lines", { type: "geojson", data: mapFeatureCollection.lines as any });
        map.addSource("georef-points", { type: "geojson", data: mapFeatureCollection.points as any });
        map.addLayer({
          id: "georef-polygons-fill",
          type: "fill",
          source: "georef-polygons",
          paint: {
            "fill-color": ["case", ["==", ["get", "draft"], 1], "#f59e0b", "#10b981"],
            "fill-opacity": 0.14,
          },
        });
        map.addLayer({
          id: "georef-polygons-line-shadow",
          type: "line",
          source: "georef-polygons",
          paint: {
            "line-color": "rgba(15, 23, 42, 0.94)",
            "line-width": ["case", ["==", ["get", "draft"], 1], 5.4, ["==", ["get", "primary"], 1], 5, 4.2],
            "line-blur": 0.6,
          },
        });
        map.addLayer({
          id: "georef-polygons-line",
          type: "line",
          source: "georef-polygons",
          paint: {
            "line-color": ["case", ["==", ["get", "draft"], 1], "#f59e0b", ["==", ["get", "primary"], 1], "#f8fafc", "#86efac"],
            "line-width": ["case", ["==", ["get", "draft"], 1], 3.2, ["==", ["get", "primary"], 1], 2.8, 2.2],
          },
        });
        map.addLayer({
          id: "georef-lines-line-shadow",
          type: "line",
          source: "georef-lines",
          paint: {
            "line-color": "rgba(15, 23, 42, 0.94)",
            "line-width": ["case", ["==", ["get", "draft"], 1], 5, 4.2],
            "line-blur": 0.6,
          },
        });
        map.addLayer({
          id: "georef-lines-line",
          type: "line",
          source: "georef-lines",
          paint: {
            "line-color": ["case", ["==", ["get", "draft"], 1], "#f97316", "#38bdf8"],
            "line-width": ["case", ["==", ["get", "draft"], 1], 2.6, 2.1],
          },
        });
        map.addLayer({
          id: "georef-points-halo",
          type: "circle",
          source: "georef-points",
          paint: {
            "circle-radius": ["case", ["==", ["get", "draft"], 1], 4, 3.5],
            "circle-color": "rgba(15, 23, 42, 0.35)",
            "circle-stroke-width": 1,
            "circle-stroke-color": "rgba(226, 232, 240, 0.6)",
          },
        });
        map.addLayer({
          id: "georef-points-circle",
          type: "circle",
          source: "georef-points",
          paint: {
            "circle-radius": ["case", ["==", ["get", "draft"], 1], 1.9, 1.6],
            "circle-color": ["case", ["==", ["get", "draft"], 1], "#facc15", "#ef4444"],
            "circle-stroke-width": 0.6,
            "circle-stroke-color": "#ffffff",
          },
        });
        if (session.overlay?.corners?.[0] && session.overlay?.corners?.[2]) {
          map.fitBounds([session.overlay.corners[0], session.overlay.corners[2]], { padding: 52, duration: 900 });
        }
        mapRef.current = map;
        setMapReady(true);
      });
    });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setMapReady(false);
    };
  }, [overlayRasterUrl, session.overlay?.corners]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const rasterSource = map.getSource("georef-raster-workspace") as any;
    if (!rasterSource && overlayRasterUrl && session.overlay?.corners?.length) {
      map.addSource("georef-raster-workspace", {
        type: "image",
        url: overlayRasterUrl,
        coordinates: session.overlay.corners,
      } as any);
      map.addLayer({
        id: "georef-raster-workspace-layer",
        type: "raster",
        source: "georef-raster-workspace",
        paint: {
          "raster-opacity": 0.82,
          "raster-resampling": "linear",
          "raster-saturation": -0.08,
          "raster-contrast": 0.14,
        },
      });
    } else if (rasterSource && overlayRasterUrl && session.overlay?.corners?.length) {
      rasterSource.updateImage({
        url: overlayRasterUrl,
        coordinates: session.overlay.corners,
      });
    }
    const polygonSource = map.getSource("georef-polygons") as any;
    const lineSource = map.getSource("georef-lines") as any;
    const pointSource = map.getSource("georef-points") as any;
    if (polygonSource) polygonSource.setData(mapFeatureCollection.polygons as any);
    if (lineSource) lineSource.setData(mapFeatureCollection.lines as any);
    if (pointSource) pointSource.setData(mapFeatureCollection.points as any);
  }, [mapFeatureCollection, mapReady, overlayRasterUrl, session.overlay?.corners]);

  const stageFeatures = useMemo(
    () =>
      previewFeatures
        .map((feature) => {
          const points = feature.pixels
            .map((point, index) => {
              const stagePosition = projectRasterPixelToStage(point.x, point.y, stageMetrics);
              if (!stagePosition) return null;
              const transformed = applyPixelTransform(point.x, point.y);
              return {
                index,
                pixelX: point.x,
                pixelY: point.y,
                targetX: transformed.target[0],
                targetY: transformed.target[1],
                lng: transformed.wgs84[0],
                lat: transformed.wgs84[1],
                leftPercent: stagePosition.leftPercent,
                topPercent: stagePosition.topPercent,
              };
            })
            .filter(Boolean) as Array<{
            index: number;
            pixelX: number;
            pixelY: number;
            targetX: number;
            targetY: number;
            lng: number;
            lat: number;
            leftPercent: number;
            topPercent: number;
          }>;
          if (!points.length) return null;
          const anchor = points.reduce(
            (acc, point) => ({
              leftPercent: acc.leftPercent + point.leftPercent / points.length,
              topPercent: acc.topPercent + point.topPercent / points.length,
            }),
            { leftPercent: 0, topPercent: 0 },
          );
          return {
            ...feature,
            draft: feature.id === "draft",
            points,
            anchor,
            pathPoints: points.map((point) => `${point.leftPercent},${point.topPercent}`).join(" "),
          };
        })
        .filter(Boolean) as Array<
        PreviewFeature & {
          draft: boolean;
          points: Array<{
            index: number;
            pixelX: number;
            pixelY: number;
            targetX: number;
            targetY: number;
            lng: number;
            lat: number;
            leftPercent: number;
            topPercent: number;
          }>;
          anchor: {
            leftPercent: number;
            topPercent: number;
          };
          pathPoints: string;
        }
      >,
    [previewFeatures, stageMetrics],
  );

  const selectedStageFeature =
    stageFeatures.find((feature) => feature.id === selectedFeatureId) ||
    stageFeatures.find((feature) => feature.draft) ||
    stageFeatures[0] ||
    null;

  const selectedFeatureCoordinateRows = selectedStageFeature?.points || [];

  const stageMarkers = useMemo(
    () =>
      stageFeatures.flatMap((feature) => {
        const showVertexMarkers =
          feature.feature_type === "point" || feature.id === selectedStageFeature?.id || feature.draft;
        if (!showVertexMarkers) return [];
        return feature.points.map((point) => ({
          id: `${feature.id}-${point.index}`,
          featureId: feature.id,
          label: feature.feature_type === "point" ? feature.label : `V${point.index + 1}`,
          left: `${point.leftPercent}%`,
          top: `${point.topPercent}%`,
          active: feature.id === selectedStageFeature?.id || feature.draft,
          pointOnly: feature.feature_type === "point",
        }));
      }),
    [selectedStageFeature?.id, stageFeatures],
  );

  const handleStagePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const liveMetrics =
      getRasterStageMetrics(
        imageStageRef.current,
        rasterImageRef.current,
        session.source_width,
        session.source_height,
      ) || stageMetrics;
    const pixel = getRasterPixelFromStageClick(
      imageStageRef.current,
      rasterImageRef.current,
      session.source_width,
      session.source_height,
      event.clientX,
      event.clientY,
    );
    if (!pixel) {
      setCursorSample(null);
      return;
    }
    const stagePosition = projectRasterPixelToStage(pixel.pixelX, pixel.pixelY, liveMetrics);
    const transformed = applyPixelTransform(pixel.pixelX, pixel.pixelY);
    setCursorSample({
      pixelX: pixel.pixelX,
      pixelY: pixel.pixelY,
      targetX: transformed.target[0],
      targetY: transformed.target[1],
      lng: transformed.wgs84[0],
      lat: transformed.wgs84[1],
      leftPercent: stagePosition?.leftPercent ?? 0,
      topPercent: stagePosition?.topPercent ?? 0,
    });
  };

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      if (!dragStateRef.current || imageZoom <= MIN_STAGE_ZOOM) return;
      const deltaX = event.clientX - dragStateRef.current.startX;
      const deltaY = event.clientY - dragStateRef.current.startY;
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        dragStateRef.current.moved = true;
        suppressNextStageClickRef.current = true;
      }
      setDraggingStage(true);
      setImagePan(clampStagePan({ x: dragStateRef.current.panX + deltaX, y: dragStateRef.current.panY + deltaY }));
    };

    const handlePointerUp = () => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      setDraggingStage(false);
      window.setTimeout(() => {
        suppressNextStageClickRef.current = false;
      }, 0);
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [clampStagePan, imageZoom]);

  const handleStageMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || imageZoom <= MIN_STAGE_ZOOM) return;
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: imagePan.x,
      panY: imagePan.y,
      moved: false,
    };
  };

  const handleStageWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -STAGE_ZOOM_STEP : STAGE_ZOOM_STEP;
    updateStageZoomAtClientPoint(imageZoom + direction, event.clientX, event.clientY);
  };

  const handleStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressNextStageClickRef.current) return;
    const pixel = getRasterPixelFromStageClick(
      imageStageRef.current,
      rasterImageRef.current,
      session.source_width,
      session.source_height,
      event.clientX,
      event.clientY,
    );
    if (!pixel) return;
    const pixelX = pixel.pixelX;
    const pixelY = pixel.pixelY;
    if (tool === "point") {
      const transformed = applyPixelTransform(pixelX, pixelY);
      const nextFeatureId = buildFeatureId();
      onFeaturesChange([
        ...features,
        {
          id: nextFeatureId,
          label: draftLabel || `Stake point ${features.filter((item) => item.feature_type === "point").length + 1}`,
          feature_type: "point",
          pixels: [{ x: pixelX, y: pixelY }],
          target_coordinates: [transformed.target],
          wgs84_coordinates: [transformed.wgs84],
        },
      ]);
      setSelectedFeatureId(nextFeatureId);
      return;
    }
    setDraftPixels((current) => [...current, { x: pixelX, y: pixelY }]);
    setSelectedFeatureId("draft");
  };

  const completeDraftFeature = () => {
    if ((tool === "line" && draftPixels.length < 2) || (tool === "polygon" && draftPixels.length < 3)) return;
    const nextCoordinatesTarget: [number, number][] = [];
    const nextCoordinatesWgs84: [number, number][] = [];
    draftPixels.forEach((point) => {
      const transformed = applyPixelTransform(point.x, point.y);
      nextCoordinatesTarget.push(transformed.target);
      nextCoordinatesWgs84.push(transformed.wgs84);
    });
    const nextFeatureId = buildFeatureId();
    if (tool === "polygon") {
      nextCoordinatesTarget.push(nextCoordinatesTarget[0]);
      nextCoordinatesWgs84.push(nextCoordinatesWgs84[0]);
    }
    onFeaturesChange([
      ...features,
      {
        id: nextFeatureId,
        label: draftLabel || toolLabels[tool],
        feature_type: tool,
        is_primary: tool === "polygon" && !features.some((item) => item.feature_type === "polygon" && item.is_primary),
        pixels: draftPixels,
        target_coordinates: nextCoordinatesTarget,
        wgs84_coordinates: nextCoordinatesWgs84,
      },
    ]);
    setDraftPixels([]);
    setSelectedFeatureId(nextFeatureId);
  };

  const markAiDigitizeQuotaExhausted = () => {
    setAiDigitizeQuotaExhausted(true);
    try {
      window.localStorage.setItem(AI_DIGITIZE_QUOTA_EXHAUSTED_KEY, new Date().toDateString());
    } catch {
      // Best-effort only, same as CoordinateInput.tsx's quota flags.
    }
  };

  // Sends the anchored raster to Gemini vision to visually locate boundary-corner/stake markers,
  // then appends the results (already converted to real-world coordinates server-side, via the
  // exact same _feature_to_saved_payload the manual tool's own save path uses) straight into the
  // existing features array as drafts - the surveyor reviews/edits/deletes them with the same
  // manual tools (select, remove, toggle primary) before saving, no separate review UI needed.
  const runAiDigitize = async () => {
    if (aiDigitizing || aiDigitizeQuotaExhausted) return;
    setAiDigitizing(true);
    try {
      const res = await api.post(
        `/survey-georeference/sessions/${session.id}/ai-digitize`,
        {},
        // Backend retries up to ~91s worst case (2 attempts x 45s read timeout) - this must stay
        // comfortably above that, same convention as every other AI call in this app.
        { timeout: 120000 },
      );
      const draftFeatures = (res.data?.draft_features || []) as GeoreferenceFeature[];
      if (draftFeatures.length === 0) {
        toast.error("AI couldn't confidently locate any boundary or stake points on this raster.");
        return;
      }
      suppressNextAutoSelectRef.current = true;
      onFeaturesChange([...features, ...draftFeatures]);
      const boundaryCount = draftFeatures.filter((f) => f.feature_type === "polygon").length;
      const stakeCount = draftFeatures.length - boundaryCount;
      const remaining = res.data?.digitize_runs_remaining_today;
      const remainingSuffix = typeof remaining === "number" ? ` (${remaining} run${remaining === 1 ? "" : "s"} left today)` : "";
      if (remaining === 0) markAiDigitizeQuotaExhausted();
      const parts: string[] = [];
      if (boundaryCount > 0) parts.push("a boundary");
      if (stakeCount > 0) parts.push(`${stakeCount} stake point${stakeCount === 1 ? "" : "s"}`);
      toast.success(`AI detected ${parts.join(" and ")} - review and adjust before saving.${remainingSuffix}`, { duration: 7000 });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 429) {
        markAiDigitizeQuotaExhausted();
        toast.error(typeof detail === "string" ? detail : "You've used all your AI digitize runs for today - please try again tomorrow.", {
          duration: 10000,
        });
      } else {
        toast.error(typeof detail === "string" ? detail : "Couldn't digitize this raster with AI. Try tracing it manually instead.");
      }
    } finally {
      setAiDigitizing(false);
    }
  };

  const togglePrimaryPolygon = (featureId: string) => {
    onFeaturesChange(
      features.map((feature) =>
        feature.feature_type === "polygon"
          ? { ...feature, is_primary: feature.id === featureId }
          : feature,
      ),
    );
    setSelectedFeatureId(featureId);
  };

  const removeFeature = (featureId: string) => {
    onFeaturesChange(features.filter((feature) => feature.id !== featureId));
    if (selectedFeatureId === featureId) {
      setSelectedFeatureId(null);
    }
  };

  return (
    <div className="step-panel georef-step-panel">
      <div className="panel-left georef-sidebar-column">
        {sidebar}
        <section className="georef-control-card">
          <div className="georef-control-head">
            <div>
              <span className="georef-kicker">Digitize & Validate</span>
              <h3>Digitize the final survey features on top of the calibrated raster</h3>
              <p>Trace boundaries, staking points, and alignment lines, then review the coordinate register before export.</p>
            </div>
            <div className="georef-quality-pill">{transform.quality} fit, {transform.rms_error_m}m RMS</div>
          </div>

          <div className="georef-tool-row">
            {(["polygon", "point", "line"] as DraftTool[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`georef-tool-pill${tool === item ? " active" : ""}`}
                onClick={() => {
                  setTool(item);
                  setDraftPixels([]);
                  setDraftLabel(item === "polygon" ? "Primary parcel" : toolLabels[item]);
                }}
              >
                {toolLabels[item]}
              </button>
            ))}
          </div>

          <div className="georef-ai-digitize-row">
            <button
              type="button"
              className="georef-ai-digitize-btn"
              disabled={aiDigitizing || aiDigitizeQuotaExhausted}
              onClick={() => void runAiDigitize()}
              title={aiDigitizeQuotaExhausted ? "Resets tomorrow" : undefined}
            >
              <img src="/LandCheck_Survey_AI_Symbol.svg" alt="" className="georef-ai-digitize-icon" aria-hidden="true" />
              {aiDigitizing
                ? "AI is digitizing..."
                : aiDigitizeQuotaExhausted
                  ? "AI digitize runs used up for today"
                  : "AI Digitize"}
            </button>
            <span className="georef-ai-digitize-hint">
              Let AI locate the boundary and stake points on the raster for you to review, instead of tracing them by hand.
            </span>
          </div>

          <div className="georef-feature-composer">
            <label>
              Feature label
              <input value={draftLabel} onChange={(event) => setDraftLabel(event.target.value)} placeholder="Primary parcel" />
            </label>
            <div className="georef-composer-actions">
              <button type="button" className="btn-outline" disabled={!draftPixels.length} onClick={() => setDraftPixels((current) => current.slice(0, -1))}>
                Undo point
              </button>
              <button type="button" className="btn-outline" disabled={!draftPixels.length} onClick={() => setDraftPixels([])}>
                Clear draft
              </button>
              {tool !== "point" && (
                <button type="button" className="btn-primary" disabled={tool === "line" ? draftPixels.length < 2 : draftPixels.length < 3} onClick={completeDraftFeature}>
                  Finish {tool === "line" ? "line" : "polygon"}
                </button>
              )}
            </div>
          </div>

          <div className="georef-feature-register">
            <div className="georef-feature-register-head">
              <div>
                <strong>Digitized layers</strong>
                <span>Review saved features, set the primary parcel, and keep the export clean.</span>
              </div>
              <div className="georef-feature-register-metrics">
                <span>{features.filter((feature) => feature.feature_type === "polygon").length} boundary</span>
                <span>{features.filter((feature) => feature.feature_type === "line").length} line</span>
                <span>{features.filter((feature) => feature.feature_type === "point").length} point</span>
              </div>
            </div>
            {features.length === 0 ? (
              <div className="georef-empty-list">
                <strong>No digitized features yet</strong>
                <span>Click the raster to place geometry, then save the working layer.</span>
              </div>
            ) : (
              <div className="georef-feature-table-wrap">
                <table className="georef-feature-table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Geometry</th>
                      <th>{projectedGroundSystem ? "Grid reference" : "Coordinate reference"}</th>
                      <th>Role</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {features.map((feature) => {
                      const firstCoordinate = feature.target_coordinates[0];
                      const rowIsActive = selectedFeatureId === feature.id;
                      return (
                        <tr
                          key={feature.id}
                          className={rowIsActive ? "is-selected" : ""}
                          onClick={() => setSelectedFeatureId(feature.id)}
                        >
                          <td>
                            <strong>
                              {feature.label}
                              {feature.label?.startsWith("AI ") && <span className="georef-ai-feature-tag">AI</span>}
                            </strong>
                            <span>{feature.feature_type === "point" ? "Stake control" : feature.feature_type === "line" ? "Alignment" : "Boundary"}</span>
                          </td>
                          <td>{describeFeatureGeometry(feature)}</td>
                          <td>
                            {firstCoordinate
                              ? `${coordinateXLabel.split(" ")[0]} ${formatGridCoordinate(firstCoordinate[0], projectedGroundSystem)} / ${coordinateYLabel.split(" ")[0]} ${formatGridCoordinate(firstCoordinate[1], projectedGroundSystem)}`
                              : "--"}
                          </td>
                          <td>
                            {feature.feature_type === "polygon" && feature.is_primary ? (
                              <span className="georef-table-badge active">Primary parcel</span>
                            ) : (
                              <span className="georef-table-badge">Saved layer</span>
                            )}
                          </td>
                          <td>
                            <div className="georef-feature-actions">
                              {feature.feature_type === "polygon" && (
                                <button
                                  type="button"
                                  className={`georef-mini-action${feature.is_primary ? " active" : ""}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    togglePrimaryPolygon(feature.id);
                                  }}
                                >
                                  {feature.is_primary ? "Primary parcel" : "Make primary"}
                                </button>
                              )}
                              <button
                                type="button"
                                className="georef-mini-action danger"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeFeature(feature.id);
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="georef-actions-row">
            <button type="button" className="btn-outline" onClick={onBack}>
              Back to control points
            </button>
            <button type="button" className="btn-primary" disabled={features.length === 0 || saving} onClick={onSaveFeatures}>
              {saving ? "Saving digitized features..." : "Save Digitized Features"}
            </button>
            <button type="button" className="btn-secondary" disabled={features.length === 0} onClick={onContinue}>
              Continue to Export
            </button>
          </div>
        </section>
      </div>

      <div className="panel-right georef-visual-column">
        <div className="georef-dual-stage">
          <section className="georef-image-card">
            <div className="georef-card-head">
              <div>
                <h4>Digitizing surface</h4>
                <span>{tool === "point" ? "Each click saves a stake point immediately." : "Click to place vertices in order, then finish the layer."}</span>
              </div>
              <div className="georef-stage-toolbar">
                <button type="button" className="btn-outline" onClick={() => updateStageZoom(imageZoom - STAGE_ZOOM_STEP)} disabled={imageZoom <= MIN_STAGE_ZOOM}>
                  -
                </button>
                <span className="georef-stage-zoom-pill">{Math.round(imageZoom * 100)}%</span>
                <button type="button" className="btn-outline" onClick={() => updateStageZoom(imageZoom + STAGE_ZOOM_STEP)} disabled={imageZoom >= MAX_STAGE_ZOOM}>
                  +
                </button>
                <button type="button" className="btn-outline" onClick={() => updateStageZoom(MIN_STAGE_ZOOM)} disabled={imageZoom === MIN_STAGE_ZOOM && imagePan.x === 0 && imagePan.y === 0}>
                  Fit
                </button>
              </div>
            </div>
            <div className="georef-image-stage-viewport" ref={imageViewportRef} onWheel={handleStageWheel}>
              <div
                className={`georef-image-stage georef-image-stage--zoomable${imageZoom > MIN_STAGE_ZOOM ? " is-zoomed" : ""}${draggingStage ? " is-dragging" : ""}`}
                ref={imageStageRef}
                onClick={handleStageClick}
                onMouseDown={handleStageMouseDown}
                onMouseMove={handleStagePointerMove}
                onMouseLeave={() => setCursorSample(null)}
                style={{ transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})` }}
              >
                {rasterObjectUrl ? (
                  <>
                    <img
                      ref={rasterImageRef}
                      src={rasterObjectUrl}
                      alt={session.title_text || "Georeferenced raster"}
                      onLoad={() =>
                        setStageMetrics(
                          getRasterStageMetrics(
                            imageStageRef.current,
                            rasterImageRef.current,
                            session.source_width,
                            session.source_height,
                          ),
                        )
                      }
                    />
                    <svg className="georef-image-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      {stageFeatures.map((feature) => {
                        const isActive = feature.id === selectedStageFeature?.id || feature.draft;
                        if (feature.feature_type === "polygon") {
                          return (
                            <g key={feature.id} className={`georef-stage-shape${isActive ? " active" : ""}`}>
                              <polygon className="georef-stage-polygon-fill" points={feature.pathPoints} />
                              <polyline className="georef-stage-polygon-line" points={`${feature.pathPoints} ${feature.points[0]?.leftPercent},${feature.points[0]?.topPercent}`} />
                              {feature.points.map((point) => (
                                <circle key={`${feature.id}-vertex-${point.index}`} className="georef-stage-vertex" cx={point.leftPercent} cy={point.topPercent} r={0.45} />
                              ))}
                            </g>
                          );
                        }
                        if (feature.feature_type === "line") {
                          return (
                            <g key={feature.id} className={`georef-stage-shape${isActive ? " active" : ""}`}>
                              <polyline className="georef-stage-line" points={feature.pathPoints} />
                              {feature.points.map((point) => (
                                <circle key={`${feature.id}-vertex-${point.index}`} className="georef-stage-vertex" cx={point.leftPercent} cy={point.topPercent} r={0.45} />
                              ))}
                            </g>
                          );
                        }
                        return (
                          <g key={feature.id} className={`georef-stage-shape${isActive ? " active" : ""}`}>
                            <circle className="georef-stage-point" cx={feature.points[0]?.leftPercent} cy={feature.points[0]?.topPercent} r={0.55} />
                          </g>
                        );
                      })}
                    </svg>
                    {stageMarkers.map((marker) => (
                      <span
                        key={marker.id}
                        className={`georef-image-marker georef-image-marker--compact${marker.active ? " active" : ""}${marker.pointOnly ? " is-point" : ""}`}
                        style={{ left: marker.left, top: marker.top }}
                      >
                        {marker.pointOnly ? (
                          <>
                            <span className="georef-image-marker-dot" aria-hidden="true" />
                            <span className="georef-image-marker-hover">{marker.label}</span>
                          </>
                        ) : (
                          <span className="georef-image-marker-badge">{marker.label}</span>
                        )}
                      </span>
                    ))}
                    {cursorSample ? (
                      <span
                        className={`georef-cursor-probe${cursorSample.leftPercent > 76 ? " is-right-edge" : ""}${cursorSample.topPercent > 82 ? " is-bottom-edge" : ""}`}
                        style={{ left: `${cursorSample.leftPercent}%`, top: `${cursorSample.topPercent}%` }}
                        aria-hidden="true"
                      >
                        <span className="georef-cursor-probe-reticle">
                          <span className="georef-cursor-probe-dot" />
                        </span>
                        <span className="georef-cursor-probe-label">
                          <strong>
                            {coordinateXLabel.split(" ")[0]} {formatGridCoordinate(cursorSample.targetX, projectedGroundSystem)}
                          </strong>
                          <span>
                            {coordinateYLabel.split(" ")[0]} {formatGridCoordinate(cursorSample.targetY, projectedGroundSystem)}
                          </span>
                        </span>
                      </span>
                    ) : null}
                  </>
                ) : (
                  <div className="georef-empty-stage">
                    <strong>Raster preview unavailable</strong>
                    <span>Reload the session to continue digitizing.</span>
                  </div>
                )}
              </div>
              {selectedStageFeature ? (
                <aside className="georef-coordinate-float">
                  <div className="georef-coordinate-float-head">
                    <div>
                      <strong>{selectedStageFeature.label}</strong>
                      <span>
                        {selectedStageFeature.feature_type === "point"
                          ? "Stake point coordinates"
                          : `${selectedFeatureCoordinateRows.length} saved coordinate${selectedFeatureCoordinateRows.length === 1 ? "" : "s"}`}
                      </span>
                    </div>
                    <span className="georef-quality-pill">
                      {selectedStageFeature.feature_type === "point" ? "Dot" : selectedStageFeature.feature_type}
                    </span>
                    <button
                      type="button"
                      className="georef-coordinate-float-close"
                      onClick={() => setSelectedFeatureId(null)}
                      aria-label="Close coordinate panel"
                      title="Close"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="georef-coordinate-mini-table-wrap">
                    <table className="georef-coordinate-mini-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>{coordinateXLabel}</th>
                          <th>{coordinateYLabel}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedFeatureCoordinateRows.map((point) => (
                          <tr
                            key={`${selectedStageFeature.id}-mini-coord-${point.index}`}
                            title={`Lon ${formatWgs84Coordinate(point.lng)} | Lat ${formatWgs84Coordinate(point.lat)}`}
                          >
                            <td>{selectedStageFeature.feature_type === "point" ? selectedStageFeature.label : `P${point.index + 1}`}</td>
                            <td>{formatGridCoordinate(point.targetX, projectedGroundSystem)}</td>
                            <td>{formatGridCoordinate(point.targetY, projectedGroundSystem)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </aside>
              ) : null}
            </div>
            <div className="georef-coordinate-strip">
              <article>
                <span>Raster X / Y</span>
                <strong>{cursorSample ? `X ${cursorSample.pixelX.toFixed(1)} / Y ${cursorSample.pixelY.toFixed(1)}` : "Move over image"}</strong>
              </article>
              <article>
                <span>{projectedGroundSystem ? "Selected grid X / Y" : "Ground X / Y"}</span>
                <strong>
                  {cursorSample
                    ? `X ${formatGridCoordinate(cursorSample.targetX, projectedGroundSystem)} / Y ${formatGridCoordinate(cursorSample.targetY, projectedGroundSystem)}`
                    : "Waiting for cursor"}
                </strong>
              </article>
              <article>
                <span>WGS84 fallback</span>
                <strong>{cursorSample ? `${formatWgs84Coordinate(cursorSample.lng)}, ${formatWgs84Coordinate(cursorSample.lat)}` : "Longitude / latitude"}</strong>
              </article>
            </div>
          </section>

          <section className="georef-map-card">
            <div className="georef-card-head">
              <h4>Anchored map proof</h4>
              <span>The raster footprint and every saved layer remain visible in the real map context.</span>
            </div>
            <div className="georef-map-surface" ref={mapContainerRef} />
          </section>
        </div>
      </div>

      {aiDigitizing && (
        <div className="georef-ai-fullscreen-overlay" role="status" aria-live="polite">
          <div className="georef-ai-fullscreen-card">
            <SurveyLoadingAnimation size="medium" />
            <p className="georef-ai-fullscreen-title">AI is digitizing your plan&hellip;</p>
            <p className="georef-ai-fullscreen-subtitle">
              Locating boundary corners and stake points on the calibrated raster. Usually just a few seconds,
              occasionally up to a minute.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(SurveyPlanGeoreferenceWorkspaceStep);
