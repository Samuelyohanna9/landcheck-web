import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadMapboxGl, MAPBOX_TOKEN } from "../../utils/mapboxLoader";
import type { GeoreferenceSession } from "../../types/surveyGeoreference";
import {
  isProjectedCoordinateSystem,
  looksLikeProjected,
  toWGS84,
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

const COORDINATE_OPTIONS = [
  { value: "wgs84", label: "WGS84 (Lat / Lon)" },
  { value: "utm_31n", label: "UTM Zone 31N" },
  { value: "utm_32n", label: "UTM Zone 32N" },
  { value: "utm_33n", label: "UTM Zone 33N" },
  { value: "minna_31", label: "Minna Zone 31" },
  { value: "minna_32", label: "Minna Zone 32" },
  { value: "minna_33", label: "Minna Zone 33" },
];

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
  type NumericField = "ground_x" | "ground_y" | "image_x" | "image_y";
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const imageStageRef = useRef<HTMLDivElement | null>(null);
  const rasterImageRef = useRef<HTMLImageElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const mapControlMarkerRefs = useRef<any[]>([]);
  const pendingRasterRef = useRef<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [stageMetrics, setStageMetrics] = useState<RasterStageMetrics | null>(null);
  const [numericDrafts, setNumericDrafts] = useState<Record<string, Partial<Record<NumericField, string>>>>({});

  const controlPoints = session?.ground_control_points || [];
  const activePoint =
    controlPoints.find((item) => item.id === selectedControlPointId) || controlPoints[controlPoints.length - 1] || null;
  const projectedGroundSystem = isProjectedCoordinateSystem(targetCoordinateSystem);
  const coordinateXLabel = projectedGroundSystem ? "Easting (m)" : "Longitude";
  const coordinateYLabel = projectedGroundSystem ? "Northing (m)" : "Latitude";
  const coordinateHint = projectedGroundSystem
    ? "Ground control coordinates are stored in meters for the selected projected grid."
    : "Ground control coordinates are stored as WGS84 ground longitude and latitude.";

  useEffect(() => {
    if (!session?.title_text) return;
    setDraftTitle(session.title_text);
  }, [session?.title_text]);

  useEffect(() => {
    setNumericDrafts({});
  }, [controlPoints]);

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
            ? toWGS84(Number(item.ground_x), Number(item.ground_y), targetCoordinateSystem)
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

  const handleNumericDraftChange = (controlPointId: string, field: NumericField, rawValue: string) => {
    setNumericDrafts((current) => ({
      ...current,
      [controlPointId]: {
        ...(current[controlPointId] || {}),
        [field]: rawValue,
      },
    }));
  };

  const commitNumericDraft = (controlPointId: string, field: NumericField) => {
    const rawValue = numericDrafts[controlPointId]?.[field];
    if (rawValue == null) return;
    const normalized = String(rawValue).trim().replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      onUpdateControlPoint(controlPointId, field, parsed);
    }
    setNumericDrafts((current) => {
      if (!current[controlPointId]) return current;
      const nextFields = { ...(current[controlPointId] || {}) };
      delete nextFields[field];
      if (Object.keys(nextFields).length === 0) {
        const nextState = { ...current };
        delete nextState[controlPointId];
        return nextState;
      }
      return {
        ...current,
        [controlPointId]: nextFields,
      };
    });
  };

  const getNumericInputValue = (controlPointId: string, field: NumericField, fallbackValue: number) => {
    const draftValue = numericDrafts[controlPointId]?.[field];
    if (draftValue != null) return draftValue;
    return Number.isFinite(fallbackValue) ? String(fallbackValue) : "";
  };

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
        if (nextId) onSelectControlPoint(nextId);
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
    if (!mapReady || !map || !session?.overlay?.corners?.length || !rasterObjectUrl) return;
    const corners = session.overlay.corners;
    const currentRaster = pendingRasterRef.current;
    if (currentRaster && currentRaster !== rasterObjectUrl) {
      try {
        if (map.getLayer("georef-raster-layer")) map.removeLayer("georef-raster-layer");
        if (map.getSource("georef-raster")) map.removeSource("georef-raster");
      } catch {
        // no-op
      }
    }
    pendingRasterRef.current = rasterObjectUrl;
    if (!map.getSource("georef-raster")) {
      map.addSource("georef-raster", {
        type: "image",
        url: rasterObjectUrl,
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
          url: rasterObjectUrl,
          coordinates: [corners[0], corners[1], corners[2], corners[3]],
        });
      } catch {
        map.removeLayer("georef-raster-layer");
        map.removeSource("georef-raster");
        map.addSource("georef-raster", {
          type: "image",
          url: rasterObjectUrl,
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
  }, [mapReady, rasterObjectUrl, session?.overlay?.corners, session?.id]);

  const handleRasterClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!activePoint) return;
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
    <div className="step-panel georef-step-panel">
      <div className="panel-left georef-sidebar-column">
        {sidebar}
        <section className="georef-control-card">
          <div className="georef-control-head">
            <div>
              <span className="georef-kicker">Georeference Workspace</span>
              <h3>Calibrate a scanned image against real coordinates</h3>
              <p>Upload a survey scan, place matching control points on the image and map, then anchor it for digitizing.</p>
            </div>
            {session ? (
              <button type="button" className="btn-outline georef-delete-btn" onClick={onDeleteSession}>
                Clear Session
              </button>
            ) : null}
          </div>

          {!session && (
            <div className="georef-upload-grid">
              <label className="georef-upload-dropzone">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setDraftFile(event.target.files?.[0] || null)}
                />
                <strong>{draftFile ? draftFile.name : "Choose raster image"}</strong>
                <span>JPEG, PNG, or WEBP scanned plans</span>
              </label>
              <div className="georef-upload-fields">
                <label>
                  Session title
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder="Fufore layout scan - July 2026"
                  />
                </label>
                <label>
                  Target coordinate system
                  <select value={targetCoordinateSystem} onChange={(event) => onTargetCoordinateSystemChange(event.target.value)}>
                    {COORDINATE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!draftFile || creatingSession}
                  onClick={() => {
                    if (!draftFile) return;
                    void onCreateSession(draftFile, draftTitle, targetCoordinateSystem);
                  }}
                >
                  {creatingSession ? "Uploading raster..." : "Upload & Open"}
                </button>
              </div>
            </div>
          )}

          {session && (
            <>
              <div className="georef-stat-grid">
                <article className="georef-stat-card">
                  <span className="georef-stat-label">Raster</span>
                  <strong>{session.source_width} x {session.source_height}</strong>
                  <small>{session.source_file_name}</small>
                </article>
                <article className="georef-stat-card">
                  <span className="georef-stat-label">Controls</span>
                  <strong>{controlPoints.length}</strong>
                  <small>Need at least 3 matched points</small>
                </article>
                <article className="georef-stat-card">
                  <span className="georef-stat-label">Fit quality</span>
                  <strong>{session.transform ? session.transform.quality : "Pending"}</strong>
                  <small>{session.transform ? `${session.transform.rms_error_m}m RMS` : "Solve once points are matched"}</small>
                </article>
              </div>

              <div className="georef-coordinate-hint">{coordinateHint}</div>

              <div className="georef-actions-row">
                <button type="button" className="btn-outline" onClick={onAddControlPoint}>
                  Add Control Point
                </button>
                <button type="button" className="btn-primary" disabled={controlPoints.length < 3 || solving} onClick={onSolve}>
                  {solving ? "Anchoring raster..." : "Solve Georeference"}
                </button>
                <button type="button" className="btn-secondary" disabled={!session.transform} onClick={onContinue}>
                  Continue to Digitize
                </button>
              </div>

              <div className="georef-control-list">
                {controlPoints.map((point) => (
                  <article
                    key={point.id}
                    className={`georef-point-row${point.id === activePoint?.id ? " active" : ""}`}
                    onClick={() => onSelectControlPoint(point.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectControlPoint(point.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="georef-point-row-head">
                      <strong>{point.label}</strong>
                      <span>{point.error_m != null ? `${point.error_m}m error` : "Pending match"}</span>
                    </div>
                    <div className="georef-point-row-grid">
                      <label>
                        Label
                        <input
                          value={point.label}
                          onChange={(event) => onUpdateControlPoint(point.id, "label", event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </label>
                      <label>
                        {coordinateXLabel}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getNumericInputValue(point.id, "ground_x", Number(point.ground_x))}
                          onChange={(event) => handleNumericDraftChange(point.id, "ground_x", event.target.value)}
                          onBlur={() => commitNumericDraft(point.id, "ground_x")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitNumericDraft(point.id, "ground_x");
                            }
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </label>
                      <label>
                        {coordinateYLabel}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getNumericInputValue(point.id, "ground_y", Number(point.ground_y))}
                          onChange={(event) => handleNumericDraftChange(point.id, "ground_y", event.target.value)}
                          onBlur={() => commitNumericDraft(point.id, "ground_y")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitNumericDraft(point.id, "ground_y");
                            }
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </label>
                      <label>
                        Pixel X
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getNumericInputValue(point.id, "image_x", Number(point.image_x))}
                          onChange={(event) => handleNumericDraftChange(point.id, "image_x", event.target.value)}
                          onBlur={() => commitNumericDraft(point.id, "image_x")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitNumericDraft(point.id, "image_x");
                            }
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </label>
                      <label>
                        Pixel Y
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getNumericInputValue(point.id, "image_y", Number(point.image_y))}
                          onChange={(event) => handleNumericDraftChange(point.id, "image_y", event.target.value)}
                          onBlur={() => commitNumericDraft(point.id, "image_y")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitNumericDraft(point.id, "image_y");
                            }
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </label>
                    </div>
                    <div className="georef-point-row-foot">
                      <span>Click the raster to set image position, then click the map to set ground position.</span>
                      <button
                        type="button"
                        className="georef-remove-point"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveControlPoint(point.id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="panel-right georef-visual-column">
        <div className="georef-dual-stage">
          <section className="georef-image-card">
            <div className="georef-card-head">
              <h4>Raster control stage</h4>
              <span>{activePoint ? `Selected: ${activePoint.label}` : "Add a control point first"}</span>
            </div>
            <div className="georef-image-stage" ref={imageStageRef} onClick={handleRasterClick}>
              {rasterObjectUrl ? (
                <>
                  <img
                    ref={rasterImageRef}
                    src={rasterObjectUrl}
                    alt={session?.title_text || "Uploaded survey raster"}
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
                        onSelectControlPoint(point.id);
                      }}
                    >
                      <span className="georef-control-point-name">{point.label}</span>
                      <span className="georef-control-point-reticle" aria-hidden="true">
                        <span className="georef-control-point-dot" />
                      </span>
                    </button>
                  ))}
                </>
              ) : (
                <div className="georef-empty-stage">
                  <strong>Upload a raster to begin</strong>
                  <span>The image will appear here for pixel control placement.</span>
                </div>
              )}
            </div>
          </section>

          <section className="georef-map-card">
            <div className="georef-card-head">
              <h4>Ground control map</h4>
              <span>Click the map to pair the selected point with a real coordinate.</span>
            </div>
            <div className="georef-map-surface" ref={mapContainerRef} />
          </section>
        </div>
      </div>
    </div>
  );
}

export default memo(SurveyPlanGeoreferenceSetupStep);
