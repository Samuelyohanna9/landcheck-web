import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadMapboxGl, MAPBOX_TOKEN } from "../../utils/mapboxLoader";
import { toWGS84 } from "../../utils/coordinateConverter";
import type { GeoreferenceFeature, GeoreferenceSession, GeoreferenceTransform } from "../../types/surveyGeoreference";

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

const buildFeatureId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `georef_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [tool, setTool] = useState<DraftTool>("polygon");
  const [draftLabel, setDraftLabel] = useState("Primary parcel");
  const [draftPixels, setDraftPixels] = useState<{ x: number; y: number }[]>([]);

  const transform = session.transform as GeoreferenceTransform;
  type PreviewFeature = GeoreferenceFeature & { source: "draft" | "saved" };

  const applyPixelTransform = (pixelX: number, pixelY: number) => {
    const coeffX = transform.coefficients.x;
    const coeffY = transform.coefficients.y;
    const targetX = coeffX[0] + coeffX[1] * pixelX + coeffX[2] * pixelY;
    const targetY = coeffY[0] + coeffY[1] * pixelX + coeffY[2] * pixelY;
    const [lng, lat] = toWGS84(targetX, targetY, transform.target_coordinate_system);
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
        if (rasterObjectUrl && session.overlay?.corners?.length) {
          map.addSource("georef-raster-workspace", {
            type: "image",
            url: rasterObjectUrl,
            coordinates: session.overlay.corners,
          } as any);
          map.addLayer({
            id: "georef-raster-workspace-layer",
            type: "raster",
            source: "georef-raster-workspace",
            paint: { "raster-opacity": 0.7, "raster-resampling": "linear" },
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
            "fill-opacity": 0.15,
          },
        });
        map.addLayer({
          id: "georef-polygons-line",
          type: "line",
          source: "georef-polygons",
          paint: {
            "line-color": ["case", ["==", ["get", "primary"], 1], "#f8fafc", "#86efac"],
            "line-width": ["case", ["==", ["get", "draft"], 1], 3.2, 2.4],
          },
        });
        map.addLayer({
          id: "georef-lines-line",
          type: "line",
          source: "georef-lines",
          paint: {
            "line-color": ["case", ["==", ["get", "draft"], 1], "#fb7185", "#38bdf8"],
            "line-width": ["case", ["==", ["get", "draft"], 1], 3, 2.2],
          },
        });
        map.addLayer({
          id: "georef-points-circle",
          type: "circle",
          source: "georef-points",
          paint: {
            "circle-radius": ["case", ["==", ["get", "draft"], 1], 8, 6],
            "circle-color": ["case", ["==", ["get", "draft"], 1], "#f59e0b", "#0ea5e9"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: "georef-feature-labels",
          type: "symbol",
          source: "georef-points",
          layout: {
            "text-field": ["get", "label"],
            "text-size": 11,
            "text-offset": [0, 1.2],
            "text-anchor": "top",
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#052e16",
            "text-halo-width": 1.5,
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
  }, [rasterObjectUrl, session.overlay?.corners]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const rasterSource = map.getSource("georef-raster-workspace") as any;
    if (!rasterSource && rasterObjectUrl && session.overlay?.corners?.length) {
      map.addSource("georef-raster-workspace", {
        type: "image",
        url: rasterObjectUrl,
        coordinates: session.overlay.corners,
      } as any);
      map.addLayer({
        id: "georef-raster-workspace-layer",
        type: "raster",
        source: "georef-raster-workspace",
        paint: { "raster-opacity": 0.7, "raster-resampling": "linear" },
      });
    } else if (rasterSource && rasterObjectUrl && session.overlay?.corners?.length) {
      rasterSource.updateImage({
        url: rasterObjectUrl,
        coordinates: session.overlay.corners,
      });
    }
    const polygonSource = map.getSource("georef-polygons") as any;
    const lineSource = map.getSource("georef-lines") as any;
    const pointSource = map.getSource("georef-points") as any;
    if (polygonSource) polygonSource.setData(mapFeatureCollection.polygons as any);
    if (lineSource) lineSource.setData(mapFeatureCollection.lines as any);
    if (pointSource) pointSource.setData(mapFeatureCollection.points as any);
  }, [mapFeatureCollection, mapReady, rasterObjectUrl, session.overlay?.corners]);

  const stageMarkers = previewFeatures.flatMap((feature) =>
    feature.pixels.map((point, index) => ({
      featureId: feature.id,
      label: feature.feature_type === "polygon" ? `${feature.label} ${index + 1}` : feature.label,
      left: session.source_width ? `${(point.x / session.source_width) * 100}%` : "0%",
      top: session.source_height ? `${(point.y / session.source_height) * 100}%` : "0%",
      draft: feature.id === "draft",
    })),
  );

  const handleStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const image = event.currentTarget.querySelector("img");
    if (!image) return;
    const bounds = image.getBoundingClientRect();
    const naturalWidth = (image as HTMLImageElement).naturalWidth || session.source_width;
    const naturalHeight = (image as HTMLImageElement).naturalHeight || session.source_height;
    if (!naturalWidth || !naturalHeight || !bounds.width || !bounds.height) return;
    const pixelX = ((event.clientX - bounds.left) / bounds.width) * naturalWidth;
    const pixelY = ((event.clientY - bounds.top) / bounds.height) * naturalHeight;
    if (tool === "point") {
      const transformed = applyPixelTransform(pixelX, pixelY);
      onFeaturesChange([
        ...features,
        {
          id: buildFeatureId(),
          label: draftLabel || `Stake point ${features.filter((item) => item.feature_type === "point").length + 1}`,
          feature_type: "point",
          pixels: [{ x: pixelX, y: pixelY }],
          target_coordinates: [transformed.target],
          wgs84_coordinates: [transformed.wgs84],
        },
      ]);
      return;
    }
    setDraftPixels((current) => [...current, { x: pixelX, y: pixelY }]);
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
    if (tool === "polygon") {
      nextCoordinatesTarget.push(nextCoordinatesTarget[0]);
      nextCoordinatesWgs84.push(nextCoordinatesWgs84[0]);
    }
    onFeaturesChange([
      ...features,
      {
        id: buildFeatureId(),
        label: draftLabel || toolLabels[tool],
        feature_type: tool,
        is_primary: tool === "polygon" && !features.some((item) => item.feature_type === "polygon" && item.is_primary),
        pixels: draftPixels,
        target_coordinates: nextCoordinatesTarget,
        wgs84_coordinates: nextCoordinatesWgs84,
      },
    ]);
    setDraftPixels([]);
  };

  const togglePrimaryPolygon = (featureId: string) => {
    onFeaturesChange(
      features.map((feature) =>
        feature.feature_type === "polygon"
          ? { ...feature, is_primary: feature.id === featureId }
          : feature,
      ),
    );
  };

  const removeFeature = (featureId: string) => {
    onFeaturesChange(features.filter((feature) => feature.id !== featureId));
  };

  return (
    <div className="step-panel georef-step-panel">
      <div className="panel-left georef-sidebar-column">
        {sidebar}
        <section className="georef-control-card">
          <div className="georef-control-head">
            <div>
              <span className="georef-kicker">Digitize & Validate</span>
              <h3>Trace what matters and keep the map proof live</h3>
              <p>The raster is anchored. Add parcel boundaries, stake points, and alignment lines before exporting DGPS-ready CSV.</p>
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

          <div className="georef-feature-list">
            {features.length === 0 ? (
              <div className="georef-empty-list">
                <strong>No digitized features yet</strong>
                <span>Click the raster to place geometry, then save the session.</span>
              </div>
            ) : (
              features.map((feature) => (
                <article key={feature.id} className="georef-feature-card">
                  <div>
                    <strong>{feature.label}</strong>
                    <p>{feature.feature_type}, {feature.pixels.length} pixel point(s)</p>
                  </div>
                  <div className="georef-feature-actions">
                    {feature.feature_type === "polygon" && (
                      <button type="button" className={`georef-mini-action${feature.is_primary ? " active" : ""}`} onClick={() => togglePrimaryPolygon(feature.id)}>
                        {feature.is_primary ? "Primary parcel" : "Make primary"}
                      </button>
                    )}
                    <button type="button" className="georef-mini-action danger" onClick={() => removeFeature(feature.id)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))
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
              <h4>Digitizing surface</h4>
              <span>{tool === "point" ? "Each click saves a point immediately." : "Click to add vertices in order."}</span>
            </div>
            <div className="georef-image-stage" onClick={handleStageClick}>
              {rasterObjectUrl ? (
                <>
                  <img src={rasterObjectUrl} alt={session.title_text || "Georeferenced raster"} />
                  {stageMarkers.map((marker, index) => (
                    <span
                      key={`${marker.featureId}-${index}`}
                      className={`georef-image-marker compact${marker.draft ? " active" : ""}`}
                      style={{ left: marker.left, top: marker.top }}
                    >
                      <span>{index + 1}</span>
                    </span>
                  ))}
                </>
              ) : (
                <div className="georef-empty-stage">
                  <strong>Raster preview unavailable</strong>
                  <span>Reload the session to continue digitizing.</span>
                </div>
              )}
            </div>
          </section>

          <section className="georef-map-card">
            <div className="georef-card-head">
              <h4>Anchored map proof</h4>
              <span>Every saved feature is plotted over the real-world image footprint.</span>
            </div>
            <div className="georef-map-surface" ref={mapContainerRef} />
          </section>
        </div>
      </div>
    </div>
  );
}

export default memo(SurveyPlanGeoreferenceWorkspaceStep);
