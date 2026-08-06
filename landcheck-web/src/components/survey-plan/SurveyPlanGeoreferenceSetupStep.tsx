import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadMapboxGl, MAPBOX_TOKEN } from "../../utils/mapboxLoader";
import type { GeoreferenceSession } from "../../types/surveyGeoreference";

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
    field: "label" | "lng" | "lat" | "image_x" | "image_y",
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
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const pendingRasterRef = useRef<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const controlPoints = session?.ground_control_points || [];
  const activePoint =
    controlPoints.find((item) => item.id === selectedControlPointId) || controlPoints[controlPoints.length - 1] || null;

  useEffect(() => {
    if (!session?.title_text) return;
    setDraftTitle(session.title_text);
  }, [session?.title_text]);

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
        mapRef.current.addSource("georef-control-points", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        mapRef.current.addLayer({
          id: "georef-control-points-circles",
          type: "circle",
          source: "georef-control-points",
          paint: {
            "circle-radius": ["case", ["==", ["get", "active"], 1], 9, 6],
            "circle-color": ["case", ["==", ["get", "active"], 1], "#f59e0b", "#10b981"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#f8fafc",
          },
        });
        mapRef.current.addLayer({
          id: "georef-control-points-labels",
          type: "symbol",
          source: "georef-control-points",
          layout: {
            "text-field": ["get", "label"],
            "text-size": 11,
            "text-offset": [0, 1.25],
            "text-anchor": "top",
          },
          paint: {
            "text-color": "#f8fafc",
            "text-halo-color": "#052e16",
            "text-halo-width": 1.5,
          },
        });
        mapRef.current.on("click", (event: any) => {
          onAssignMapPoint(Number(event.lngLat.lng), Number(event.lngLat.lat));
        });
        setMapReady(true);
      });
    });

    return () => {
      cancelled = true;
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
        .filter((item) => Number.isFinite(item.lng) && Number.isFinite(item.lat))
        .map((item) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [item.lng, item.lat] },
          properties: {
            label: item.label,
            active: item.id === activePoint?.id ? 1 : 0,
          },
        })),
    }),
    [activePoint?.id, controlPoints],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const source = map.getSource("georef-control-points") as any;
    if (source) {
      source.setData(pointSource as any);
    }
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
    const target = event.currentTarget;
    const image = target.querySelector("img");
    if (!image) return;
    const bounds = image.getBoundingClientRect();
    const naturalWidth = (image as HTMLImageElement).naturalWidth || session?.source_width || 0;
    const naturalHeight = (image as HTMLImageElement).naturalHeight || session?.source_height || 0;
    if (!naturalWidth || !naturalHeight || !bounds.width || !bounds.height) return;
    const relativeX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const relativeY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const pixelX = (relativeX / bounds.width) * naturalWidth;
    const pixelY = (relativeY / bounds.height) * naturalHeight;
    onAssignImagePoint(pixelX, pixelY);
  };

  const stageMarkers = controlPoints
    .filter((item) => Number.isFinite(item.image_x) && Number.isFinite(item.image_y))
    .map((item) => ({
      ...item,
      left: session?.source_width ? `${(item.image_x / session.source_width) * 100}%` : "0%",
      top: session?.source_height ? `${(item.image_y / session.source_height) * 100}%` : "0%",
    }));

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
                        Longitude
                        <input
                          value={Number.isFinite(point.lng) ? point.lng : ""}
                          onChange={(event) => onUpdateControlPoint(point.id, "lng", event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </label>
                      <label>
                        Latitude
                        <input
                          value={Number.isFinite(point.lat) ? point.lat : ""}
                          onChange={(event) => onUpdateControlPoint(point.id, "lat", event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </label>
                      <label>
                        Pixel X
                        <input
                          value={Number.isFinite(point.image_x) ? Math.round(point.image_x) : ""}
                          onChange={(event) => onUpdateControlPoint(point.id, "image_x", event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </label>
                      <label>
                        Pixel Y
                        <input
                          value={Number.isFinite(point.image_y) ? Math.round(point.image_y) : ""}
                          onChange={(event) => onUpdateControlPoint(point.id, "image_y", event.target.value)}
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
            <div className="georef-image-stage" onClick={handleRasterClick}>
              {rasterObjectUrl ? (
                <>
                  <img src={rasterObjectUrl} alt={session?.title_text || "Uploaded survey raster"} />
                  {stageMarkers.map((point) => (
                    <button
                      key={point.id}
                      type="button"
                      className={`georef-image-marker${point.id === activePoint?.id ? " active" : ""}`}
                      style={{ left: point.left, top: point.top }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectControlPoint(point.id);
                      }}
                    >
                      <span>{point.label}</span>
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
