import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../api/client";
import { loadMapboxGl, MAPBOX_TOKEN } from "../../utils/mapboxLoader";
import SurveyLoadingAnimation from "../SurveyLoadingAnimation";
import CoordinateSystemSelect from "../CoordinateSystemSelect";
import type { GeoreferenceSession, GeoreferenceTransform } from "../../types/surveyGeoreference";
import {
  COUNTRY_MAP_VIEW,
  getCoordinateSystemCountry,
  getCoordinateSystemLabel,
  isProjectedCoordinateSystem,
  looksLikeProjected,
  mercatorToWGS84,
  toWGS84,
  WGS84_NIGERIA_METERS,
} from "../../utils/coordinateConverter";
import {
  getRasterPixelFromStageClick,
  getRasterStageMetrics,
  projectRasterPixelToStage,
  type RasterStageMetrics,
} from "../../utils/georeferenceRasterStage";

type Props = {
  sidebar: ReactNode;
  session: GeoreferenceSession | null;
  rasterObjectUrl: string | null;
  selectedControlPointId: string | null;
  targetCoordinateSystem: string;
  creatingSession: boolean;
  solving: boolean;
  onCreateSession: (file: File, titleText: string, targetCoordinateSystem: string) => void | Promise<void>;
  onTargetCoordinateSystemChange: (value: string) => void;
  onSelectControlPoint: (controlPointId: string) => void;
  onAddControlPoint: () => void;
  onRemoveControlPoint: (controlPointId: string) => void;
  onUpdateControlPoint: (
    controlPointId: string,
    field: "label" | "ground_x" | "ground_y" | "image_x" | "image_y",
    value: string | number,
  ) => void;
  onAssignImagePoint: (pixelX: number, pixelY: number) => void;
  onAssignMapPoint: (lng: number, lat: number) => void;
  onSolve: () => void | Promise<void>;
  onContinue: () => void;
  onDeleteSession: () => void | Promise<void>;
};

const MIN_STAGE_ZOOM = 1;
const MAX_STAGE_ZOOM = 4;
const STAGE_ZOOM_STEP = 0.25;

function SurveyPlanGeoreferenceSetupStep({
  sidebar,
  session,
  rasterObjectUrl,
  selectedControlPointId,
  targetCoordinateSystem,
  creatingSession,
  solving,
  onCreateSession,
  onTargetCoordinateSystemChange,
  onSelectControlPoint,
  onAddControlPoint,
  onRemoveControlPoint,
  onUpdateControlPoint,
  onAssignImagePoint,
  onAssignMapPoint,
  onSolve,
  onContinue,
  onDeleteSession,
}: Props) {
  type EditDraft = {
    pointId: string;
    label: string;
    ground_x: string;
    ground_y: string;
    image_x: string;
    image_y: string;
  };
  const imageViewportRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const imageStageRef = useRef<HTMLDivElement | null>(null);
  const rasterImageRef = useRef<HTMLImageElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const mapControlMarkerRefs = useRef<any[]>([]);
  const lastCountryRef = useRef<string | null>(null);
  const pendingRasterRef = useRef<string | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
  const suppressNextImageClickRef = useRef(false);
  const controlPointRefs = useRef<Record<string, HTMLElement | null>>({});
  const editFirstFieldRef = useRef<HTMLInputElement | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [addPointMenuOpen, setAddPointMenuOpen] = useState(false);
  const [pendingPlacementMode, setPendingPlacementMode] = useState<"manual" | "map" | null>(null);
  const [stageMetrics, setStageMetrics] = useState<RasterStageMetrics | null>(null);
  // Only one GCP's inputs are ever editable at a time - every other row shows compact read-only
  // values. Buffered as its own draft object (not committed field-by-field on blur like before)
  // so Save/Cancel can apply or discard the whole row's edits together.
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [rowMenuOpenId, setRowMenuOpenId] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(MIN_STAGE_ZOOM);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [draggingStage, setDraggingStage] = useState(false);
  const [cursorSample, setCursorSample] = useState<{
    pixelX: number;
    pixelY: number;
    leftPercent: number;
    topPercent: number;
    targetX: number | null;
    targetY: number | null;
    lng: number | null;
    lat: number | null;
  } | null>(null);

  const controlPoints = session?.ground_control_points || [];
  const pointIsReady = (point: (typeof controlPoints)[number]) => {
    const hasImage = Number.isFinite(point.image_x) && Number.isFinite(point.image_y) && (Math.abs(point.image_x) > 0.5 || Math.abs(point.image_y) > 0.5);
    const hasGround = Number.isFinite(point.ground_x) && Number.isFinite(point.ground_y) && (Math.abs(point.ground_x) > 0.0001 || Math.abs(point.ground_y) > 0.0001);
    return hasImage && hasGround;
  };
  const activePoint =
    controlPoints.find((item) => item.id === selectedControlPointId) || controlPoints[controlPoints.length - 1] || null;
  const solvedTransform = (session?.transform || null) as GeoreferenceTransform | null;
  const effectiveTransformSystem =
    solvedTransform?.resolved_coordinate_system ||
    solvedTransform?.target_coordinate_system ||
    targetCoordinateSystem;
  const overlayRasterUrl = session?.overlay?.raster_url
    ? (/^https?:\/\//i.test(session.overlay.raster_url) ? session.overlay.raster_url : `${api.defaults.baseURL || ""}${session.overlay.raster_url}`)
    : rasterObjectUrl;
  const projectedGroundSystem = isProjectedCoordinateSystem(effectiveTransformSystem);
  const effectiveCoordinateLabel = getCoordinateSystemLabel(effectiveTransformSystem || targetCoordinateSystem || "wgs84");
  const coordinateXLabel = projectedGroundSystem ? "Easting (m)" : "Longitude";
  const coordinateYLabel = projectedGroundSystem ? "Northing (m)" : "Latitude";
  const coordinateHint =
    String(targetCoordinateSystem || "").trim().toLowerCase() === WGS84_NIGERIA_METERS
      ? "Nigeria metres auto-resolves the correct WGS84 / UTM zone from your control locations while keeping values in metres."
      : projectedGroundSystem
        ? `Ground control coordinates are stored in meters for ${effectiveCoordinateLabel}.`
        : "Ground control coordinates are stored as WGS84 ground longitude and latitude.";

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
      session?.source_width || 0,
      session?.source_height || 0,
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
    if (!solvedTransform) return null;

    const homography = Array.isArray(solvedTransform.homography) ? solvedTransform.homography : null;
    const mapHomography = Array.isArray(solvedTransform.map_homography) ? solvedTransform.map_homography : null;
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
      const coeffX = solvedTransform.coefficients.x;
      const coeffY = solvedTransform.coefficients.y;
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

    if (!usedMapTransform) {
      [lng, lat] = toWGS84(targetX, targetY, effectiveTransformSystem);
    }

    return {
      targetX,
      targetY,
      lng,
      lat,
    };
  };

  useEffect(() => {
    if (!session?.title_text) return;
    setDraftTitle(session.title_text);
  }, [session?.title_text]);

  useEffect(() => {
    if (editDraft && !controlPoints.some((point) => point.id === editDraft.pointId)) {
      setEditDraft(null);
    }
  }, [controlPoints, editDraft]);

  useEffect(() => {
    if (!rowMenuOpenId) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(event.target as Node)) {
        setRowMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [rowMenuOpenId]);

  useEffect(() => {
    setImageZoom(MIN_STAGE_ZOOM);
    setImagePan({ x: 0, y: 0 });
    setDraggingStage(false);
    dragStateRef.current = null;
    suppressNextImageClickRef.current = false;
  }, [session?.id, rasterObjectUrl]);

  useEffect(() => {
    const measure = () => {
      const nextMetrics = getRasterStageMetrics(
        imageStageRef.current,
        rasterImageRef.current,
        session?.source_width || 0,
        session?.source_height || 0,
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
  }, [rasterObjectUrl, session?.id, session?.source_height, session?.source_width]);

  useEffect(() => {
    if (!activePoint?.id) return;
    controlPointRefs.current[activePoint.id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activePoint?.id]);

  // "Add manually" has nowhere else to type coordinates now that rows are collapsed by default -
  // it opens that point's edit draft directly instead of relying on an always-visible input.
  useEffect(() => {
    if (pendingPlacementMode !== "manual" || !activePoint) return;
    setEditDraft({
      pointId: activePoint.id,
      label: activePoint.label,
      ground_x: Number.isFinite(activePoint.ground_x) ? String(activePoint.ground_x) : "",
      ground_y: Number.isFinite(activePoint.ground_y) ? String(activePoint.ground_y) : "",
      image_x: Number.isFinite(activePoint.image_x) ? String(activePoint.image_x) : "",
      image_y: Number.isFinite(activePoint.image_y) ? String(activePoint.image_y) : "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlacementMode, activePoint?.id]);

  useEffect(() => {
    if (editDraft) editFirstFieldRef.current?.focus();
  }, [editDraft?.pointId]);

  const selectControlPoint = (controlPointId: string) => {
    setPendingPlacementMode(null);
    onSelectControlPoint(controlPointId);
  };

  const startEditPoint = (point: (typeof controlPoints)[number]) => {
    setRowMenuOpenId(null);
    selectControlPoint(point.id);
    setEditDraft({
      pointId: point.id,
      label: point.label,
      ground_x: Number.isFinite(point.ground_x) ? String(point.ground_x) : "",
      ground_y: Number.isFinite(point.ground_y) ? String(point.ground_y) : "",
      image_x: Number.isFinite(point.image_x) ? String(point.image_x) : "",
      image_y: Number.isFinite(point.image_y) ? String(point.image_y) : "",
    });
  };

  const cancelEdit = () => setEditDraft(null);

  const saveEdit = () => {
    if (!editDraft) return;
    const { pointId, label, ground_x, ground_y, image_x, image_y } = editDraft;
    onUpdateControlPoint(pointId, "label", label);
    (
      [
        ["ground_x", ground_x],
        ["ground_y", ground_y],
        ["image_x", image_x],
        ["image_y", image_y],
      ] as const
    ).forEach(([field, raw]) => {
      const parsed = Number.parseFloat(String(raw).trim().replace(",", "."));
      if (Number.isFinite(parsed)) onUpdateControlPoint(pointId, field, parsed);
    });
    setEditDraft(null);
  };

  const updateEditDraft = (field: keyof Omit<EditDraft, "pointId">, value: string) => {
    setEditDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const formatGroundValue = (value: number) => (Number.isFinite(value) ? value.toFixed(projectedGroundSystem ? 3 : 6) : "--");
  const formatPixelValue = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : "--");

  const startAddPoint = (mode: "manual" | "map") => {
    setAddPointMenuOpen(false);
    setPendingPlacementMode(mode);
    onAddControlPoint();
  };

  useEffect(() => {
    let cancelled = false;
    if (!mapContainerRef.current || mapRef.current) return;
    loadMapboxGl().then((mapboxgl) => {
      if (cancelled || !mapContainerRef.current) return;
      mapboxRef.current = mapboxgl;
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [12.4, 9.2],
        zoom: 5.6,
        accessToken: MAPBOX_TOKEN,
      });
      mapRef.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
      mapRef.current.on("load", () => {
        if (!mapRef.current) return;
        mapRef.current.on("click", (event: any) => {
          onAssignMapPoint(Number(event.lngLat.lng), Number(event.lngLat.lat));
        });
        setMapReady(true);
      });
    });

    return () => {
      cancelled = true;
      mapControlMarkerRefs.current.forEach((marker) => marker.remove());
      mapControlMarkerRefs.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      mapboxRef.current = null;
      setMapReady(false);
    };
  }, [onAssignMapPoint]);

  // Recenters the map on the chosen target coordinate system's country - only on an actual
  // country change (not every zone tweak within the same country). Fires even with control
  // points already placed: a coordinate-system change usually means the surveyor is about to
  // work somewhere else, so the map staying put would be the confusing outcome. If a real point
  // exists, the pointSource-driven effect below will fly to it right after anyway.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const country = getCoordinateSystemCountry(targetCoordinateSystem || "wgs84");
    const view = COUNTRY_MAP_VIEW[country];
    const isFirstRun = lastCountryRef.current === null;
    const countryChanged = !isFirstRun && lastCountryRef.current !== country;
    lastCountryRef.current = country;
    if (!view) return;
    if (isFirstRun ? country === "Nigeria" : !countryChanged) return;

    const flyToCountry = () => map.flyTo({ center: view.center, zoom: view.zoom, duration: 1200 });
    if (map.isStyleLoaded?.()) {
      flyToCountry();
    } else {
      map.once("load", flyToCountry);
    }
  }, [targetCoordinateSystem]);

  const pointSource = useMemo(
    () => ({
      type: "FeatureCollection",
      features: controlPoints
        .filter(
          (item) =>
            Number.isFinite(item.ground_x) &&
            Number.isFinite(item.ground_y) &&
            (Math.abs(item.ground_x) > 1e-6 || Math.abs(item.ground_y) > 1e-6),
        )
        .map((item) => {
          const shouldConvertToWgs84 =
            projectedGroundSystem && looksLikeProjected(Number(item.ground_x), Number(item.ground_y));
              const [mapLng, mapLat] = shouldConvertToWgs84
                ? toWGS84(Number(item.ground_x), Number(item.ground_y), effectiveTransformSystem)
                : [Number(item.ground_x), Number(item.ground_y)];
          if (!Number.isFinite(mapLng) || !Number.isFinite(mapLat)) {
            return null;
          }
          if (mapLng < -180 || mapLng > 180 || mapLat < -90 || mapLat > 90) {
            return null;
          }
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [mapLng, mapLat] },
            properties: {
              id: item.id,
              label: item.label,
              active: item.id === activePoint?.id ? 1 : 0,
            },
          };
        })
        .filter(Boolean),
    }),
    [activePoint?.id, controlPoints, projectedGroundSystem, targetCoordinateSystem],
  );

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!mapReady || !map || !mapboxgl) return;
    mapControlMarkerRefs.current.forEach((marker) => marker.remove());
    mapControlMarkerRefs.current = [];

    pointSource.features.forEach((feature: any) => {
      if (feature?.geometry?.type !== "Point" || !Array.isArray(feature.geometry.coordinates)) return;
      const markerButton = document.createElement("button");
      markerButton.type = "button";
      markerButton.className = `georef-map-gcp-marker${feature.properties?.active === 1 ? " active" : ""}`;
      markerButton.setAttribute("aria-label", String(feature.properties?.label || "Control point"));
      markerButton.title = String(feature.properties?.label || "Control point");

      const name = document.createElement("span");
      name.className = "georef-control-point-name";
      name.textContent = String(feature.properties?.label || "GCP");

      const reticle = document.createElement("span");
      reticle.className = "georef-control-point-reticle";
      reticle.setAttribute("aria-hidden", "true");

      const dot = document.createElement("span");
      dot.className = "georef-control-point-dot";
      reticle.appendChild(dot);

      markerButton.appendChild(name);
      markerButton.appendChild(reticle);
      markerButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const nextId = String(feature.properties?.id || "");
        if (nextId) selectControlPoint(nextId);
      });

      const marker = new mapboxgl.Marker({
        element: markerButton,
        anchor: "center",
      })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .addTo(map);

      mapControlMarkerRefs.current.push(marker);
    });

    if (pointSource.features.length) {
      const first = pointSource.features[0];
      if (first?.geometry?.type === "Point") {
        map.flyTo({ center: first.geometry.coordinates as [number, number], zoom: Math.max(map.getZoom(), 13), essential: true });
      }
    }
  }, [mapReady, pointSource]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (!session?.overlay?.corners?.length || !overlayRasterUrl) {
      // The transform went stale (a control point was edited/added since the last solve) - drop
      // the old raster image instead of leaving it on the map, where it would silently keep
      // showing a footprint that no longer matches the current control points.
      try {
        if (map.getLayer("georef-raster-layer")) map.removeLayer("georef-raster-layer");
        if (map.getSource("georef-raster")) map.removeSource("georef-raster");
      } catch {
        // no-op
      }
      pendingRasterRef.current = null;
      return;
    }
    const corners = session.overlay.corners;
    const currentRaster = pendingRasterRef.current;
    if (currentRaster && currentRaster !== overlayRasterUrl) {
      try {
        if (map.getLayer("georef-raster-layer")) map.removeLayer("georef-raster-layer");
        if (map.getSource("georef-raster")) map.removeSource("georef-raster");
      } catch {
        // no-op
      }
    }
    pendingRasterRef.current = overlayRasterUrl;
    if (!map.getSource("georef-raster")) {
      map.addSource("georef-raster", {
        type: "image",
        url: overlayRasterUrl,
        coordinates: [corners[0], corners[1], corners[2], corners[3]],
      } as any);
      map.addLayer({
        id: "georef-raster-layer",
        type: "raster",
        source: "georef-raster",
        paint: { "raster-opacity": 0.74, "raster-resampling": "linear" },
      });
    } else {
      try {
        (map.getSource("georef-raster") as any).updateImage({
          url: overlayRasterUrl,
          coordinates: [corners[0], corners[1], corners[2], corners[3]],
        });
      } catch {
        map.removeLayer("georef-raster-layer");
        map.removeSource("georef-raster");
        map.addSource("georef-raster", {
          type: "image",
          url: overlayRasterUrl,
          coordinates: [corners[0], corners[1], corners[2], corners[3]],
        } as any);
        map.addLayer({
          id: "georef-raster-layer",
          type: "raster",
          source: "georef-raster",
          paint: { "raster-opacity": 0.74, "raster-resampling": "linear" },
        });
      }
    }
    map.fitBounds([corners[0], corners[2]], { padding: 48, duration: 800 });
  }, [mapReady, overlayRasterUrl, session?.overlay?.corners, session?.id]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      if (!dragStateRef.current || imageZoom <= MIN_STAGE_ZOOM) return;
      const deltaX = event.clientX - dragStateRef.current.startX;
      const deltaY = event.clientY - dragStateRef.current.startY;
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        dragStateRef.current.moved = true;
        suppressNextImageClickRef.current = true;
      }
      setDraggingStage(true);
      setImagePan(clampStagePan({ x: dragStateRef.current.panX + deltaX, y: dragStateRef.current.panY + deltaY }));
    };

    const handlePointerUp = () => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      setDraggingStage(false);
      window.setTimeout(() => {
        suppressNextImageClickRef.current = false;
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
    event.preventDefault();
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

  const handleStagePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const liveMetrics =
      getRasterStageMetrics(
        imageStageRef.current,
        rasterImageRef.current,
        session?.source_width || 0,
        session?.source_height || 0,
      ) || stageMetrics;
    const pixel = getRasterPixelFromStageClick(
      imageStageRef.current,
      rasterImageRef.current,
      session?.source_width || 0,
      session?.source_height || 0,
      event.clientX,
      event.clientY,
    );
    if (!pixel) {
      setCursorSample(null);
      return;
    }
    const stagePosition = projectRasterPixelToStage(pixel.pixelX, pixel.pixelY, liveMetrics);
    if (!stagePosition) {
      setCursorSample(null);
      return;
    }
    const transformed = applyPixelTransform(pixel.pixelX, pixel.pixelY);
    setCursorSample({
      pixelX: pixel.pixelX,
      pixelY: pixel.pixelY,
      leftPercent: stagePosition.leftPercent,
      topPercent: stagePosition.topPercent,
      targetX: transformed ? Number(transformed.targetX.toFixed(projectedGroundSystem ? 3 : 6)) : null,
      targetY: transformed ? Number(transformed.targetY.toFixed(projectedGroundSystem ? 3 : 6)) : null,
      lng: transformed ? Number(transformed.lng.toFixed(8)) : null,
      lat: transformed ? Number(transformed.lat.toFixed(8)) : null,
    });
  };

  const handleRasterClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressNextImageClickRef.current || !activePoint) return;
    const pixel = getRasterPixelFromStageClick(
      imageStageRef.current,
      rasterImageRef.current,
      session?.source_width || 0,
      session?.source_height || 0,
      event.clientX,
      event.clientY,
    );
    if (!pixel) return;
    onAssignImagePoint(pixel.pixelX, pixel.pixelY);
  };

  const stageMarkers = controlPoints
    .filter(
      (item) =>
        Number.isFinite(item.image_x) &&
        Number.isFinite(item.image_y) &&
        (Math.abs(item.image_x) > 0.5 || Math.abs(item.image_y) > 0.5),
    )
    .map((item) => {
      const stagePosition = projectRasterPixelToStage(item.image_x, item.image_y, stageMetrics);
      return {
        ...item,
        left: stagePosition ? `${stagePosition.leftPercent}%` : "0%",
        top: stagePosition ? `${stagePosition.topPercent}%` : "0%",
      };
    });

  return (
    <div className="step-panel georef-step-panel georef-workspace-redesign">
      <div className="georef-workspace-grid">
        <aside className="geo-panel geo-panel-left" data-tab-panel="tools">
          <div className="geo-left-scroll">
            {sidebar}
            <div className="geo-panel-heading">
              <h2>Control points</h2>
              <p>Upload the scan, match the control points, then lock it in for digitizing.</p>
            </div>

            {!session && (
              <div className="geo-section">
                <h3 className="geo-section-title">Raster</h3>
                <label className="georef-upload-dropzone">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => setDraftFile(event.target.files?.[0] || null)}
                  />
                  <strong>{draftFile ? draftFile.name : "Choose raster image"}</strong>
                  <span>JPEG, PNG, or WEBP scanned plans</span>
                </label>
                <label className="geo-field-label" htmlFor="georef-title-input">
                  Image title
                </label>
                <input
                  id="georef-title-input"
                  className="geo-field-input"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  placeholder="Fufore layout scan - July 2026"
                />
                <label className="geo-field-label" htmlFor="georef-target-crs-select">
                  Target coordinate system
                </label>
                <CoordinateSystemSelect
                  id="georef-target-crs-select"
                  value={targetCoordinateSystem}
                  onChange={onTargetCoordinateSystemChange}
                />
                <button
                  type="button"
                  className="geo-btn geo-btn-primary geo-btn-block"
                  disabled={!draftFile || creatingSession}
                  onClick={() => {
                    if (!draftFile) return;
                    void onCreateSession(draftFile, draftTitle, targetCoordinateSystem);
                  }}
                >
                  {creatingSession ? "Uploading raster..." : "Open Workspace"}
                </button>
                {creatingSession && (
                  <SurveyLoadingAnimation label="Uploading and preparing your raster..." size="small" />
                )}
              </div>
            )}

            {session && (
              <>
                <div className="geo-section">
                  <h3 className="geo-section-title">Raster</h3>
                  <p className="geo-section-hint">
                    {session.source_width} x {session.source_height} &middot; {session.source_file_name}
                  </p>
                  <p className="geo-section-hint">
                    {controlPoints.length} control point{controlPoints.length === 1 ? "" : "s"} &middot; match at
                    least three
                  </p>
                </div>

                {session.transform ? (
                  <div className="geo-quality-card" data-quality={session.transform.exact_fit ? "usable" : session.transform.quality}>
                    <span className="geo-quality-icon" aria-hidden="true">
                      {session.transform.quality === "weak" && !session.transform.exact_fit ? (
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
                        <span>
                          {session.transform.exact_fit
                            ? "Exact fit (3 pts)"
                            : session.transform.quality === "strong"
                              ? "Good fit"
                              : session.transform.quality === "usable"
                                ? "Usable fit"
                                : "Weak fit"}
                        </span>{" "}
                        &middot;{" "}
                        <span>
                          RMS {session.transform.exact_fit ? "n/a" : `${session.transform.rms_error_m.toFixed(3)} m`}
                        </span>
                      </strong>
                      <span className="geo-quality-caption">Georeferencing quality</span>
                    </div>
                  </div>
                ) : (
                  <div className="geo-section">
                    <h3 className="geo-section-title">Fit quality</h3>
                    <p className="geo-section-hint">Pending - solve once points are matched.</p>
                  </div>
                )}

                <div className="geo-section">
                  <p className="geo-section-hint">{coordinateHint}</p>
                  <button
                    type="button"
                    className="geo-btn geo-btn-primary geo-btn-block"
                    disabled={controlPoints.length < 3 || solving}
                    onClick={onSolve}
                  >
                    {solving ? "Anchoring raster..." : "Anchor Raster"}
                  </button>
                </div>

                <div className="geo-section">
                  <h3 className="geo-section-title">
                    Control register
                    <span className="geo-section-hint">
                      {" "}
                      {controlPoints.filter((point) => pointIsReady(point)).length}/{controlPoints.length} ready
                    </span>
                  </h3>
              <div className="georef-control-list">
                {controlPoints.map((point) => {
                  const isEditing = editDraft?.pointId === point.id;
                  const isActive = point.id === activePoint?.id;
                  if (isEditing) {
                    return (
                      <article
                        key={point.id}
                        ref={(node) => {
                          controlPointRefs.current[point.id] = node;
                        }}
                        className={`georef-point-row is-editing${isActive ? " active" : ""}`}
                      >
                        <div className="georef-point-row-head">
                          <strong>{point.label || "GCP"}</strong>
                          <span className={`georef-point-status georef-point-status--${pointIsReady(point) ? "ready" : "pending"}`}>
                            {pointIsReady(point) ? "Ready" : "Needs input"}
                          </span>
                        </div>
                        <div className="georef-point-row-grid">
                          <label>
                            Label
                            <input
                              ref={editFirstFieldRef}
                              value={editDraft.label}
                              onChange={(event) => updateEditDraft("label", event.target.value)}
                            />
                          </label>
                          <label>
                            {coordinateXLabel}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editDraft.ground_x}
                              onChange={(event) => updateEditDraft("ground_x", event.target.value)}
                            />
                          </label>
                          <label>
                            {coordinateYLabel}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editDraft.ground_y}
                              onChange={(event) => updateEditDraft("ground_y", event.target.value)}
                            />
                          </label>
                          <label>
                            Pixel X
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editDraft.image_x}
                              onChange={(event) => updateEditDraft("image_x", event.target.value)}
                            />
                          </label>
                          <label>
                            Pixel Y
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editDraft.image_y}
                              onChange={(event) => updateEditDraft("image_y", event.target.value)}
                            />
                          </label>
                        </div>
                        <div className="georef-point-row-foot">
                          <span>Click the raster to set image position, then click the map to set ground position.</span>
                        </div>
                        <div className="geo-composer-actions">
                          <button type="button" className="geo-btn geo-btn-outline" onClick={cancelEdit}>
                            Cancel
                          </button>
                          <button type="button" className="geo-btn geo-btn-primary" onClick={saveEdit}>
                            Save
                          </button>
                        </div>
                      </article>
                    );
                  }
                  return (
                    <article
                      key={point.id}
                      ref={(node) => {
                        controlPointRefs.current[point.id] = node;
                      }}
                      className={`georef-point-row is-compact${isActive ? " active" : ""}`}
                      onClick={() => selectControlPoint(point.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectControlPoint(point.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="georef-point-row-line1">
                        <strong>{point.label || "GCP"}</strong>
                        <span className={`georef-point-status georef-point-status--${pointIsReady(point) ? "ready" : "pending"}`}>
                          {point.error_m != null ? `${point.error_m}m error` : pointIsReady(point) ? "Ready" : "Needs input"}
                        </span>
                      </div>
                      <div className="georef-point-row-line2">
                        {formatGroundValue(Number(point.ground_x))}, {formatGroundValue(Number(point.ground_y))}
                      </div>
                      <div className="georef-point-row-line3">
                        <span>
                          Pixel {formatPixelValue(Number(point.image_x))}, {formatPixelValue(Number(point.image_y))}
                        </span>
                        <div
                          className="georef-row-menu"
                          ref={rowMenuOpenId === point.id ? rowMenuRef : undefined}
                        >
                          <button
                            type="button"
                            className="georef-row-menu-btn"
                            aria-label={`Actions for ${point.label || "GCP"}`}
                            aria-haspopup="menu"
                            aria-expanded={rowMenuOpenId === point.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setRowMenuOpenId((current) => (current === point.id ? null : point.id));
                            }}
                          >
                            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <path d="M10 5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM10 18a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                            </svg>
                          </button>
                          {rowMenuOpenId === point.id && (
                            <div className="georef-row-menu-popover" role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startEditPoint(point);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="is-destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setRowMenuOpenId(null);
                                  onRemoveControlPoint(point.id);
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
                  </div>
                  <button type="button" className="geo-btn geo-btn-outline geo-btn-block" onClick={() => setAddPointMenuOpen(true)}>
                    Add Next GCP
                  </button>
                </div>
              </>
            )}
          </div>

          {session && (
            <div className="geo-left-footer">
              <button type="button" className="geo-btn geo-btn-destructive-subtle" onClick={onDeleteSession} title="Clear session">
                Clear Session
              </button>
              <button
                type="button"
                className="geo-btn geo-btn-primary"
                disabled={!session.transform}
                onClick={onContinue}
                title={!session.transform ? "Anchor the raster before continuing." : undefined}
              >
                Continue to Digitize
              </button>
            </div>
          )}
        </aside>

        <section className="geo-panel geo-panel-canvas" data-tab-panel="raster">
          <div className="geo-panel-heading">
            <h2>Raster control stage</h2>
            <p>{activePoint ? `Selected: ${activePoint.label}` : "Add a control point first"}</p>
          </div>
          <div className="geo-canvas-wrap">
            <div className="geo-canvas-toolbar">
              <button type="button" className="geo-canvas-tool-btn" onClick={() => setAddPointMenuOpen(true)} disabled={!session} title="Add Next GCP">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
              <span className="geo-canvas-toolbar-divider" aria-hidden="true" />
              <button
                type="button"
                className="geo-canvas-tool-btn"
                onClick={() => updateStageZoom(imageZoom - STAGE_ZOOM_STEP)}
                disabled={!rasterObjectUrl || imageZoom <= MIN_STAGE_ZOOM}
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="geo-zoom-pill">{Math.round(imageZoom * 100)}%</span>
              <button
                type="button"
                className="geo-canvas-tool-btn"
                onClick={() => updateStageZoom(imageZoom + STAGE_ZOOM_STEP)}
                disabled={!rasterObjectUrl || imageZoom >= MAX_STAGE_ZOOM}
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                className="geo-canvas-tool-btn geo-canvas-tool-btn--fit"
                onClick={() => updateStageZoom(MIN_STAGE_ZOOM)}
                disabled={!rasterObjectUrl || (imageZoom === MIN_STAGE_ZOOM && imagePan.x === 0 && imagePan.y === 0)}
              >
                Fit
              </button>
            </div>
            {pendingPlacementMode && activePoint && !pointIsReady(activePoint) ? (
              <div className="georef-guidance-banner">
                <span>
                  {pendingPlacementMode === "manual"
                    ? `Type the pixel position and ground coordinate for "${activePoint.label}" in the fields on the left.`
                    : `Click the matching point on the raster image, then click the same location on the reference map for "${activePoint.label}".`}
                </span>
                <button type="button" onClick={() => setPendingPlacementMode(null)}>
                  Done
                </button>
              </div>
            ) : null}
            <div className="georef-image-stage-viewport" ref={imageViewportRef} onWheel={handleStageWheel}>
              <div
                className={`georef-image-stage georef-image-stage--zoomable${imageZoom > MIN_STAGE_ZOOM ? " is-zoomed" : ""}${draggingStage ? " is-dragging" : ""}`}
                ref={imageStageRef}
                onClick={handleRasterClick}
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
                      alt={session?.title_text || "Uploaded survey raster"}
                      draggable={false}
                      onLoad={() =>
                        setStageMetrics(
                          getRasterStageMetrics(
                            imageStageRef.current,
                            rasterImageRef.current,
                            session?.source_width || 0,
                            session?.source_height || 0,
                          ),
                        )
                      }
                    />
                    {stageMarkers.map((point) => (
                      <button
                        key={point.id}
                        type="button"
                        className={`georef-image-marker georef-control-point-marker${point.id === activePoint?.id ? " active" : ""}`}
                        style={{ left: point.left, top: point.top }}
                        aria-label={point.label}
                        title={point.label}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectControlPoint(point.id);
                        }}
                      >
                        <span className="georef-control-point-name">{point.label}</span>
                        <span className="georef-control-point-reticle" aria-hidden="true">
                          <span className="georef-control-point-dot" />
                        </span>
                      </button>
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
                          <strong>PX {cursorSample.pixelX.toFixed(1)}</strong>
                          <span>PY {cursorSample.pixelY.toFixed(1)}</span>
                        </span>
                      </span>
                    ) : null}
                  </>
                ) : (
                  <div className="georef-empty-stage">
                    <strong>Upload a raster to see it here</strong>
                    <span>Once uploaded, it appears here for pixel control placement.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="geo-status-bar">
            <span className="geo-status-item">
              <em>Raster X / Y</em>
              <span>{cursorSample ? `${cursorSample.pixelX.toFixed(1)} / ${cursorSample.pixelY.toFixed(1)}` : "Move over image"}</span>
            </span>
            <span className="geo-status-item">
              <em>Selected GCP target</em>
              <span>
                {activePoint
                  ? `${coordinateXLabel.split(" ")[0]} ${Number(activePoint.ground_x).toLocaleString(undefined, { maximumFractionDigits: projectedGroundSystem ? 3 : 6 })} / ${coordinateYLabel.split(" ")[0]} ${Number(activePoint.ground_y).toLocaleString(undefined, { maximumFractionDigits: projectedGroundSystem ? 3 : 6 })}`
                  : "Select a control point"}
              </span>
            </span>
            <span className="geo-status-item">
              <em>{solvedTransform ? "Live solved preview" : "Ground preview"}</em>
              <span>
                {solvedTransform && cursorSample?.targetX != null && cursorSample?.targetY != null
                  ? `${coordinateXLabel.split(" ")[0]} ${cursorSample.targetX.toLocaleString(undefined, { maximumFractionDigits: projectedGroundSystem ? 3 : 6 })} / ${coordinateYLabel.split(" ")[0]} ${cursorSample.targetY.toLocaleString(undefined, { maximumFractionDigits: projectedGroundSystem ? 3 : 6 })}`
                  : "Solve georeference to preview grid values"}
              </span>
            </span>
          </div>
        </section>

        <section className="geo-panel geo-panel-map" data-tab-panel="map">
          <div className="geo-panel-heading">
            <h2>Ground control map</h2>
            <p>Click the map to pair the selected point with a real coordinate.</p>
          </div>
          {pendingPlacementMode === "map" && activePoint && !pointIsReady(activePoint) ? (
            <div className="georef-guidance-banner">
              <span>Now click the matching location on the map for "{activePoint.label}".</span>
              <button type="button" onClick={() => setPendingPlacementMode(null)}>
                Done
              </button>
            </div>
          ) : null}
          <div className="geo-map-surface" ref={mapContainerRef} />
        </section>
      </div>

      {addPointMenuOpen ? (
        <div className="georef-add-point-backdrop" onClick={() => setAddPointMenuOpen(false)}>
          <div className="georef-add-point-menu" onClick={(event) => event.stopPropagation()}>
            <h4>Add ground control point</h4>
            <p>How do you want to set this point's coordinates?</p>
            <div className="georef-add-point-menu-actions">
              <button type="button" className="geo-btn geo-btn-primary" onClick={() => startAddPoint("manual")}>
                Add manually
              </button>
              <button type="button" className="geo-btn geo-btn-outline" onClick={() => startAddPoint("map")}>
                Choose point on map
              </button>
              <button type="button" className="geo-btn geo-btn-outline" onClick={() => setAddPointMenuOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default memo(SurveyPlanGeoreferenceSetupStep);
