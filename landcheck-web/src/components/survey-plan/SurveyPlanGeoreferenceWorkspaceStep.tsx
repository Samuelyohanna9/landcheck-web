import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { api } from "../../api/client";
import SurveyLoadingAnimation from "../SurveyLoadingAnimation";
import { loadMapboxGl, MAPBOX_TOKEN } from "../../utils/mapboxLoader";
import { getCoordinateSystemLabel, isProjectedCoordinateSystem, mercatorToWGS84, toWGS84 } from "../../utils/coordinateConverter";
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
  line: "Alignment",
  polygon: "Boundary",
};

const toolShortcutKeys: Record<DraftTool, string> = {
  polygon: "B",
  point: "P",
  line: "L",
};

// Small line-style glyphs so each drawing tool is recognizable at a glance, not just by label -
// deliberately plain stroked shapes (no fill) to read clearly at 18px against the dark panel.
const toolIcons: Record<DraftTool, ReactNode> = {
  polygon: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7 8 4l8 2-1 8-9 2z" />
    </svg>
  ),
  point: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="10" cy="10" r="3.2" />
      <circle cx="10" cy="10" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  line: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3 15 9 8l4 3 4-7" />
    </svg>
  ),
};

type LayerTypeKey = "polygon" | "point" | "line";

const layerRowConfig: { type: LayerTypeKey; label: string; swatchClass: string }[] = [
  { type: "polygon", label: "Parcel boundary", swatchClass: "is-boundary" },
  { type: "point", label: "Stake points", swatchClass: "is-stake" },
  { type: "line", label: "Alignment lines", swatchClass: "is-line" },
];

// Small presentational pieces kept local to this file (props-only, no shared state) - reused for
// the three drawing-tool buttons and the four layer rows so those blocks aren't one large inline
// JSX mass. Not extracted to separate files since nothing else in the app needs them.
function DrawingToolButton({
  tool,
  active,
  onSelect,
}: {
  tool: DraftTool;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`geo-tool-btn${active ? " active" : ""}`}
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`${toolLabels[tool]} tool (shortcut ${toolShortcutKeys[tool]})`}
      title={`Shortcut: ${toolShortcutKeys[tool]}`}
    >
      <span className="geo-tool-btn-icon">{toolIcons[tool]}</span>
      <span className="geo-tool-btn-label">{toolLabels[tool]}</span>
      <span className="geo-tool-btn-shortcut" aria-hidden="true">
        {toolShortcutKeys[tool]}
      </span>
      {active && (
        <svg className="geo-tool-btn-check" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}

function LayerRow({
  label,
  swatchClass,
  count,
  hidden,
  onToggleVisibility,
}: {
  label: string;
  swatchClass: string;
  count: number;
  hidden?: boolean;
  onToggleVisibility?: () => void;
}) {
  return (
    <div className="geo-layer-row">
      <span className={`geo-layer-swatch ${swatchClass}`} aria-hidden="true" />
      <span className="geo-layer-label" title={label}>
        {label}
      </span>
      <span className="geo-layer-count">{count}</span>
      {onToggleVisibility ? (
        <button
          type="button"
          className={`geo-layer-visibility${hidden ? " is-hidden" : ""}`}
          onClick={onToggleVisibility}
          aria-pressed={!hidden}
          aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
          title={hidden ? "Hidden - click to show" : "Visible - click to hide"}
        >
          {hidden ? (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l14 14M8.5 8.7a2 2 0 002.8 2.8M6.3 6.5C4.6 7.6 3.3 9 2.5 10c1.6 2.6 4.4 5 7.5 5 1 0 2-.2 2.9-.6M11.8 5.3c-.6-.1-1.2-.2-1.8-.2-3.1 0-5.9 2.4-7.5 5" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M2.5 10c1.6-2.6 4.4-5 7.5-5s5.9 2.4 7.5 5c-1.6 2.6-4.4 5-7.5 5s-5.9-2.4-7.5-5z" />
              <circle cx="10" cy="10" r="2" />
            </svg>
          )}
        </button>
      ) : (
        <span className="geo-layer-visibility geo-layer-visibility--static" title="Set on the previous step">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M2.5 10c1.6-2.6 4.4-5 7.5-5s5.9 2.4 7.5 5c-1.6 2.6-4.4 5-7.5 5s-5.9-2.4-7.5-5z" />
            <circle cx="10" cy="10" r="2" />
          </svg>
        </span>
      )}
    </div>
  );
}

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
  const [rasterLoadState, setRasterLoadState] = useState<"loading" | "loaded" | "error">("loading");
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
  // Pure client-side display filter - never touches what's saved/exported, only which saved
  // features are drawn on the raster stage and the Mapbox map right now.
  const [hiddenLayerTypes, setHiddenLayerTypes] = useState<Set<LayerTypeKey>>(() => new Set());
  const toggleLayerVisibility = (type: LayerTypeKey) => {
    setHiddenLayerTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };
  const [basemapStyle, setBasemapStyle] = useState<"satellite" | "vector">("satellite");
  const [overlayOpacity, setOverlayOpacity] = useState(0.82);
  const [rasterOverlayVisible, setRasterOverlayVisible] = useState(true);
  const [layerManagerOpen, setLayerManagerOpen] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<"tools" | "raster" | "map">("raster");
  const [mapColumnWidthPercent, setMapColumnWidthPercent] = useState(33);
  const mapResizeStateRef = useRef<{ startX: number; startWidthPercent: number; containerWidth: number } | null>(null);
  const workspaceGridRef = useRef<HTMLDivElement | null>(null);

  // Medium-screen drag handle between the canvas and map columns - a lightweight, self-contained
  // resize (a display preference only, no data/layout implications beyond this component's own
  // grid-template-columns).
  const handleMapResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    const containerWidth = workspaceGridRef.current?.getBoundingClientRect().width || 1;
    mapResizeStateRef.current = { startX: event.clientX, startWidthPercent: mapColumnWidthPercent, containerWidth };
  };

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const dragState = mapResizeStateRef.current;
      if (!dragState) return;
      const deltaPercent = ((dragState.startX - event.clientX) / dragState.containerWidth) * 100;
      const nextPercent = Math.max(24, Math.min(50, dragState.startWidthPercent + deltaPercent));
      setMapColumnWidthPercent(nextPercent);
    };
    const handleUp = () => {
      mapResizeStateRef.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);
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
    setRasterLoadState(rasterObjectUrl ? "loading" : "error");
  }, [session.id, rasterObjectUrl]);

  const mapFeatureCollection = useMemo(() => {
    const pointFeatures: any[] = [];
    const lineFeatures: any[] = [];
    const polygonFeatures: any[] = [];

    previewFeatures.forEach((feature) => {
      const coords = feature.wgs84_coordinates || [];
      if (!coords.length) return;
      if (feature.source !== "draft" && hiddenLayerTypes.has(feature.feature_type)) return;
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
  }, [previewFeatures, hiddenLayerTypes]);

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
        style:
          basemapStyle === "vector"
            ? "mapbox://styles/mapbox/streets-v12"
            : "mapbox://styles/mapbox/satellite-streets-v12",
        center: [12.4, 9.2],
        zoom: 5.8,
        accessToken: MAPBOX_TOKEN,
      });
      map.addControl(new mapboxgl.FullscreenControl(), "top-right");
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
              "raster-opacity": overlayOpacity,
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
    // overlayOpacity/mapFeatureCollection are deliberately excluded here - both are synced by
    // their own lightweight effects below instead of tearing down and recreating the whole map
    // (which would lose the surveyor's current pan/zoom) every time a slider drags or a feature is
    // added. basemapStyle IS included - switching basemap style is infrequent, and Mapbox clears
    // every custom source/layer on setStyle anyway, so a full, clean re-init is simpler and safer
    // than manually re-adding everything on a "style.load" event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayRasterUrl, session.overlay?.corners, basemapStyle]);

  // Keeps the raster overlay's opacity/visibility in sync with the slider and the layer manager's
  // toggle, without tearing down and recreating the whole map.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !map.getLayer?.("georef-raster-workspace-layer")) return;
    map.setPaintProperty("georef-raster-workspace-layer", "raster-opacity", rasterOverlayVisible ? overlayOpacity : 0);
  }, [overlayOpacity, rasterOverlayVisible, mapReady]);

  // Note: layer visibility on the map is handled by mapFeatureCollection already excluding
  // hidden-type features from its GeoJSON (see its filter above) rather than a separate
  // setLayoutProperty toggle - one source of truth, same effect on both the map and the raster
  // stage's own SVG rendering (stageFeatures applies the identical filter).

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
        .filter((feature) => feature.source === "draft" || !hiddenLayerTypes.has(feature.feature_type))
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
    [previewFeatures, stageMetrics, hiddenLayerTypes],
  );

  const selectedStageFeature =
    stageFeatures.find((feature) => feature.id === selectedFeatureId) ||
    stageFeatures.find((feature) => feature.draft) ||
    stageFeatures[0] ||
    null;

  const selectedFeatureCoordinateRows = selectedStageFeature?.points || [];

  // Status-bar-only derived values - pure display math over data that's already computed above
  // (selectedStageFeature already reflects the in-progress draft while drawing, since a placed
  // vertex immediately selects "draft"), nothing here is stored or exported.
  const statusVertexCount = selectedFeatureCoordinateRows.length;
  const statusTotalDistance = selectedFeatureCoordinateRows.reduce((total, point, index) => {
    if (index === 0) return 0;
    const previous = selectedFeatureCoordinateRows[index - 1];
    const dx = point.targetX - previous.targetX;
    const dy = point.targetY - previous.targetY;
    return total + Math.sqrt(dx * dx + dy * dy);
  }, 0);
  const crsLabel = getCoordinateSystemLabel(effectiveTransformSystem);
  const qualityLabel: Record<GeoreferenceTransform["quality"], string> = {
    strong: "Good fit",
    usable: "Usable fit",
    weak: "Weak fit",
  };
  // A 3-point affine fit is exactly determined, so its RMS is ~0 by construction and
  // says nothing about placement accuracy - show it as its own state rather than "Good fit".
  const displayQualityKey: GeoreferenceTransform["quality"] = transform.exact_fit ? "usable" : transform.quality;
  const displayQualityLabel = transform.exact_fit ? "Exact fit (3 pts)" : qualityLabel[transform.quality];
  const rmsDisplay = transform.exact_fit ? "n/a" : `${transform.rms_error_m.toFixed(3)} m`;

  // Compact digitized-features summary - pure derived counts over the same `features` array the
  // detailed table below already renders, nothing new stored.
  const boundaryFeatureCount = features.filter((feature) => feature.feature_type === "polygon").length;
  const stakeFeatureCount = features.filter((feature) => feature.feature_type === "point").length;
  const lineFeatureCount = features.filter((feature) => feature.feature_type === "line").length;
  const primaryParcelFeature = features.find((feature) => feature.feature_type === "polygon" && feature.is_primary);
  const digitizedValidationStatus =
    boundaryFeatureCount === 0 ? "No boundary yet" : !primaryParcelFeature ? "Set a primary parcel" : "Ready to save";

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

  // B/P/L switch tools, Escape cancels the in-progress draft, Delete/Backspace drops the last
  // placed vertex - guarded against firing while the user is actually typing (e.g. the feature
  // label field) so shortcut letters don't hijack normal text entry.
  useEffect(() => {
    const shortcutToTool: Record<string, DraftTool> = { b: "polygon", p: "point", l: "line" };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTextInput) return;

      if (event.key === "Escape") {
        if (draftPixels.length) {
          setDraftPixels([]);
          event.preventDefault();
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (draftPixels.length) {
          setDraftPixels((current) => current.slice(0, -1));
          event.preventDefault();
        }
        return;
      }
      const nextTool = shortcutToTool[event.key.toLowerCase()];
      if (nextTool) {
        setTool(nextTool);
        setDraftPixels([]);
        setDraftLabel(nextTool === "polygon" ? "Primary parcel" : toolLabels[nextTool]);
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [draftPixels.length]);

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
    <div className={`step-panel georef-step-panel georef-workspace-redesign${leftPanelCollapsed ? " left-collapsed" : ""}`} data-active-tab={activeMobileTab}>
      <div
        className="georef-workspace-grid"
        ref={workspaceGridRef}
        style={{ "--geo-map-col-width": `${mapColumnWidthPercent}%` } as React.CSSProperties}
      >
        <aside className="geo-panel geo-panel-left" data-tab-panel="tools">
          <button
            type="button"
            className="geo-left-collapse-toggle"
            onClick={() => setLeftPanelCollapsed((value) => !value)}
            aria-label={leftPanelCollapsed ? "Show tools panel" : "Hide tools panel"}
            title={leftPanelCollapsed ? "Show tools panel" : "Hide tools panel"}
          >
            {leftPanelCollapsed ? "›" : "‹"}
          </button>
          <div className="geo-left-scroll">
            {sidebar}
            <div className="geo-panel-heading">
              <h2>Feature tools</h2>
              <p>Trace and digitize features on the georeferenced raster.</p>
            </div>

            <div className="geo-quality-card" data-quality={displayQualityKey}>
              <span className="geo-quality-icon" aria-hidden="true">
                {displayQualityKey === "weak" ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </span>
              <div className="geo-quality-copy">
                <strong>
                  <span>{displayQualityLabel}</span> &middot; <span>RMS {rmsDisplay}</span>
                </strong>
                <span className="geo-quality-caption">
                  Georeferencing quality
                  <button
                    type="button"
                    className="geo-info-btn"
                    aria-label="What is RMS error?"
                    title={
                      transform.exact_fit
                        ? "With exactly 3 control points the transform passes through all of them exactly, so RMS is not a meaningful accuracy signal. Add a 4th point to get a real fit-quality measurement."
                        : "Average control-point alignment error, in metres - how far the solved transform's own control points land from their true positions. Lower is a tighter fit."
                    }
                  >
                    ?
                  </button>
                </span>
              </div>
            </div>

            <div className="geo-section">
              <h3 className="geo-section-title">Drawing tools</h3>
              <div className="geo-tool-group">
                {(["polygon", "point", "line"] as DraftTool[]).map((item) => (
                  <DrawingToolButton
                    key={item}
                    tool={item}
                    active={tool === item}
                    onSelect={() => {
                      setTool(item);
                      setDraftPixels([]);
                      setDraftLabel(item === "polygon" ? "Primary parcel" : toolLabels[item]);
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="geo-section">
              <h3 className="geo-section-title">Feature details</h3>
              <div className="geo-feature-composer">
                <label className="geo-field-label" htmlFor="geo-feature-label-input">
                  Feature label
                </label>
                <input
                  id="geo-feature-label-input"
                  className="geo-field-input"
                  value={draftLabel}
                  onChange={(event) => setDraftLabel(event.target.value)}
                  placeholder="Primary parcel"
                />
                <div className="geo-composer-actions">
                  <button
                    type="button"
                    className="geo-btn geo-btn-outline"
                    disabled={!draftPixels.length}
                    onClick={() => setDraftPixels((current) => current.slice(0, -1))}
                  >
                    Undo point
                  </button>
                  <button
                    type="button"
                    className="geo-btn geo-btn-destructive-subtle"
                    disabled={!draftPixels.length}
                    onClick={() => setDraftPixels([])}
                  >
                    Clear draft
                  </button>
                </div>
                {tool !== "point" && (
                  <button
                    type="button"
                    className="geo-btn geo-btn-primary geo-btn-block"
                    disabled={tool === "line" ? draftPixels.length < 2 : draftPixels.length < 3}
                    onClick={completeDraftFeature}
                  >
                    Finish {tool === "line" ? "line" : "polygon"}
                  </button>
                )}
              </div>
            </div>

            <div className="geo-section">
              <h3 className="geo-section-title">Layers</h3>
              <div className="geo-layers-card">
                {layerRowConfig.map((row) => (
                  <LayerRow
                    key={row.type}
                    label={row.label}
                    swatchClass={row.swatchClass}
                    count={features.filter((feature) => feature.feature_type === row.type).length}
                    hidden={hiddenLayerTypes.has(row.type)}
                    onToggleVisibility={() => toggleLayerVisibility(row.type)}
                  />
                ))}
                <LayerRow label="Control points" swatchClass="is-control" count={session.ground_control_points?.length ?? 0} />
              </div>
            </div>

            <div className="geo-section">
              <h3 className="geo-section-title">Digitized features</h3>
              {features.length === 0 ? (
                <div className="geo-empty-list">
                  <svg className="geo-empty-list-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 6 8 3l8 2-1 8-9 2z" />
                    <circle cx="10" cy="10" r="0.6" fill="currentColor" stroke="none" />
                  </svg>
                  <div>
                    <strong>No features digitized yet</strong>
                    <span>Select a drawing tool and click the raster to add geometry.</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="geo-digitized-summary">
                    <div className="geo-digitized-summary-row">
                      <span>Primary parcel</span>
                      <strong>{primaryParcelFeature ? primaryParcelFeature.label : "Not set"}</strong>
                    </div>
                    <div className="geo-digitized-summary-row">
                      <span>Stake points</span>
                      <strong>{stakeFeatureCount}</strong>
                    </div>
                    <div className="geo-digitized-summary-row">
                      <span>Alignment lines</span>
                      <strong>{lineFeatureCount}</strong>
                    </div>
                    <div className="geo-digitized-summary-row">
                      <span>Status</span>
                      <strong
                        className={`geo-digitized-status${digitizedValidationStatus === "Ready to save" ? " is-ready" : ""}`}
                      >
                        {digitizedValidationStatus}
                      </strong>
                    </div>
                  </div>
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
                </>
              )}
            </div>

            <div className="geo-ai-card">
              <div className="geo-ai-card-head">
                <img src="/LandCheck_Survey_AI_Symbol.svg" alt="" className="geo-ai-card-icon" aria-hidden="true" />
                <strong>AI assistance</strong>
              </div>
              {aiDigitizeQuotaExhausted ? (
                <>
                  <p className="geo-ai-card-status">AI limit reached today</p>
                  <p className="geo-ai-card-hint">Come back tomorrow for more AI help.</p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="geo-btn geo-btn-ai geo-btn-block"
                    disabled={aiDigitizing}
                    onClick={() => void runAiDigitize()}
                  >
                    {aiDigitizing ? "AI is digitizing…" : "AI Digitize"}
                  </button>
                  <p className="geo-ai-card-hint">
                    Let AI locate the boundary and stake points on the raster for you to review, instead of tracing
                    them by hand.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="geo-left-footer">
            <button type="button" className="geo-btn geo-btn-outline" onClick={onBack} title="Back to control points">
              Back
            </button>
            <button
              type="button"
              className="geo-btn geo-btn-primary"
              disabled={features.length === 0 || saving}
              onClick={onSaveFeatures}
              title={features.length === 0 ? "Digitize at least one feature before saving." : undefined}
            >
              {saving ? "Saving…" : "Save features"}
            </button>
          </div>
        </aside>

        <section className="geo-panel geo-panel-canvas" data-tab-panel="raster">
          <div className="geo-panel-heading">
            <h2>Survey plan</h2>
            <p>
              {tool === "point"
                ? "Each click saves a stake point immediately."
                : "Click points in order, then press Finish to complete the shape."}
            </p>
          </div>
          <div className="geo-canvas-wrap">
            <div className="geo-canvas-toolbar">
              <button
                type="button"
                className="geo-canvas-tool-btn"
                disabled={!draftPixels.length}
                onClick={() => setDraftPixels((current) => current.slice(0, -1))}
                aria-label="Undo last point"
                title="Undo last point"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 5 3 9l4 4M3 9h9a4 4 0 010 8h-2" />
                </svg>
              </button>
              <span className="geo-canvas-toolbar-divider" aria-hidden="true" />
              <button
                type="button"
                className="geo-canvas-tool-btn"
                onClick={() => updateStageZoom(imageZoom - STAGE_ZOOM_STEP)}
                disabled={imageZoom <= MIN_STAGE_ZOOM}
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="geo-zoom-pill">{Math.round(imageZoom * 100)}%</span>
              <button
                type="button"
                className="geo-canvas-tool-btn"
                onClick={() => updateStageZoom(imageZoom + STAGE_ZOOM_STEP)}
                disabled={imageZoom >= MAX_STAGE_ZOOM}
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                className="geo-canvas-tool-btn geo-canvas-tool-btn--fit"
                onClick={() => updateStageZoom(MIN_STAGE_ZOOM)}
                disabled={imageZoom === MIN_STAGE_ZOOM && imagePan.x === 0 && imagePan.y === 0}
              >
                Fit
              </button>
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
                      style={rasterLoadState === "loaded" ? undefined : { visibility: "hidden" }}
                      onLoad={(event) => {
                        const target = event.currentTarget;
                        if (target.naturalWidth <= 0 || target.naturalHeight <= 0) {
                          setRasterLoadState("error");
                          return;
                        }
                        setRasterLoadState("loaded");
                        setStageMetrics(
                          getRasterStageMetrics(
                            imageStageRef.current,
                            rasterImageRef.current,
                            session.source_width,
                            session.source_height,
                          ),
                        );
                      }}
                      onError={() => setRasterLoadState("error")}
                    />
                    {rasterLoadState !== "loaded" ? (
                      <div className="georef-empty-stage">
                        <strong>{rasterLoadState === "error" ? "Survey plan could not be loaded." : "Loading survey plan…"}</strong>
                        <span>
                          {rasterLoadState === "error"
                            ? "Reload the session, or start a new plan and re-upload the file."
                            : "This can take a moment for large scans."}
                        </span>
                      </div>
                    ) : null}
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
          </div>
          <div className="geo-status-bar">
            <span className="geo-status-item">
              <em>CRS</em>
              <span>{crsLabel}</span>
            </span>
            <span className="geo-status-item">
              <em>{coordinateXLabel.split(" ")[0]} / {coordinateYLabel.split(" ")[0]}</em>
              <span>
                {cursorSample
                  ? `${formatGridCoordinate(cursorSample.targetX, projectedGroundSystem)} / ${formatGridCoordinate(cursorSample.targetY, projectedGroundSystem)}`
                  : "Move over image"}
              </span>
            </span>
            <span className="geo-status-item">
              <em>Vertices</em>
              <span>{statusVertexCount}</span>
            </span>
            <span className="geo-status-item">
              <em>Length</em>
              <span>{projectedGroundSystem ? `${statusTotalDistance.toFixed(2)} m` : statusTotalDistance.toFixed(6)}</span>
            </span>
            <span className="geo-status-item geo-status-item--snap">
              <em>Snapping</em>
              <span>Off</span>
            </span>
          </div>
        </section>

        <section className="geo-panel geo-panel-map" data-tab-panel="map">
          <div className="geo-panel-heading geo-panel-heading--map">
            <h2>Map check</h2>
            <div className="geo-map-toolbar">
              <div className="geo-basemap-switch" role="group" aria-label="Basemap style">
                <button type="button" className={basemapStyle === "satellite" ? "active" : ""} onClick={() => setBasemapStyle("satellite")}>
                  Satellite
                </button>
                <button type="button" className={basemapStyle === "vector" ? "active" : ""} onClick={() => setBasemapStyle("vector")}>
                  Vector
                </button>
              </div>
              <button
                type="button"
                className={`geo-icon-btn${layerManagerOpen ? " active" : ""}`}
                onClick={() => setLayerManagerOpen((value) => !value)}
                aria-pressed={layerManagerOpen}
                aria-label="Layer manager"
                title="Layer manager"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 3 3 7l7 4 7-4z" />
                  <path d="M3 11l7 4 7-4" />
                </svg>
              </button>
            </div>
          </div>
          <div className="geo-map-surface-wrap">
            <div className="geo-map-resize-handle" onMouseDown={handleMapResizeStart} title="Drag to resize" />
            <div className="geo-map-surface" ref={mapContainerRef} />
            {layerManagerOpen && (
              <div className="geo-layer-manager-popover">
                <strong>Layers</strong>
                <label>
                  <input type="checkbox" checked={rasterOverlayVisible} onChange={(event) => setRasterOverlayVisible(event.target.checked)} />
                  Raster overlay
                </label>
                {layerRowConfig.map((row) => (
                  <label key={row.type}>
                    <input
                      type="checkbox"
                      checked={!hiddenLayerTypes.has(row.type)}
                      onChange={() => toggleLayerVisibility(row.type)}
                    />
                    {row.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="geo-opacity-row">
            <label htmlFor="geo-overlay-opacity">Plan opacity</label>
            <input
              id="geo-overlay-opacity"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={overlayOpacity}
              onChange={(event) => setOverlayOpacity(Number(event.target.value))}
            />
            <span>{Math.round(overlayOpacity * 100)}%</span>
          </div>
        </section>
      </div>

      <div className="geo-mobile-tabs">
        <button type="button" className={activeMobileTab === "tools" ? "active" : ""} onClick={() => setActiveMobileTab("tools")}>
          Tools
        </button>
        <button type="button" className={activeMobileTab === "raster" ? "active" : ""} onClick={() => setActiveMobileTab("raster")}>
          Raster
        </button>
        <button type="button" className={activeMobileTab === "map" ? "active" : ""} onClick={() => setActiveMobileTab("map")}>
          Map
        </button>
      </div>

      <div className="geo-primary-cta-dock">
        <button
          type="button"
          className="geo-btn geo-btn-primary geo-btn-cta"
          disabled={features.length === 0}
          onClick={onContinue}
          title={features.length === 0 ? "Digitize at least one boundary before continuing" : undefined}
        >
          Review &amp; export →
        </button>
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
