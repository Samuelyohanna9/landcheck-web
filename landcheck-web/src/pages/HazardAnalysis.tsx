import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { api } from "../api/client";
import CoordinateInput from "../components/CoordinateInput";
import HazardInteractiveOverlay, { type HazardInteractiveMeta } from "../components/HazardInteractiveOverlay";
import HazardProgressOverlay from "../components/HazardProgressOverlay";
import { fromWGS84, toWGS84 } from "../utils/coordinateConverter";
import "../styles/hazard-analysis.css";

type HazardJobStatus = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string | null;
  progress_pct: number | null;
  error_text: string | null;
  result: any;
  download_url: string | null;
};

const MapViewEnhanced = lazy(() => import("../components/MapViewEnhanced"));

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
};

type HazardType = "flood" | "erosion";

type LegendItem = { label: string; color: string };

type HazardReference = { short?: string; citation: string; url?: string };

type FloodResult = {
  risk_score: number;
  risk_class: string;
  class_color?: string;
  mean_depth_m: number;
  max_depth_m: number;
  inundation_percent: number;
  distance_to_river_m?: number;
  depth_score?: number;
  inundation_score?: number;
  river_proximity_score?: number;
  overlay: string;
  note: string;
  buffer_m: number;
  method: string;
  legend: LegendItem[];
  return_period: number;
  data_available?: boolean;
  local_elevation_used?: boolean;
  relative_elevation_m?: number | null;
  buildings_total?: number;
  buildings_threatened?: number;
  interactive?: HazardInteractiveMeta | null;
  flood_data_source?: "glofas" | "local_terrain_proxy";
  terrain_slope_deg?: number | null;
  terrain_depression_m?: number | null;
  terrain_flatness_score?: number | null;
  terrain_drainage_score?: number | null;
  terrain_depression_score?: number | null;
  references?: HazardReference[];
};

type ErosionResult = {
  risk_score: number;
  risk_class: string;
  class_color?: string;
  mean_slope_deg: number;
  max_slope_deg: number;
  mean_ndvi: number;
  distance_to_drainage_m: number;
  slope_score?: number;
  vegetation_score?: number;
  drainage_score?: number;
  overlay: string;
  note: string;
  buffer_m: number;
  method: string;
  legend: LegendItem[];
  data_available?: boolean;
  slope_source?: "local_survey" | "global_dem" | "unavailable";
  buildings_total?: number;
  buildings_threatened?: number;
  interactive?: HazardInteractiveMeta | null;
  references?: HazardReference[];
};

const riskChipClass = (riskClass: string) => {
  const normalized = riskClass.toLowerCase();
  if (normalized === "no data") return "no-data";
  return normalized;
};

function ComponentBars({ items }: { items: { label: string; value: number; color: string }[] }) {
  return (
    <div className="risk-components">
      {items.map((item) => (
        <div key={item.label} className="risk-component-row">
          <span className="risk-component-label">{item.label}</span>
          <div className="risk-component-track">
            <div
              className="risk-component-fill"
              style={{ width: `${Math.max(2, Math.min(100, item.value * 100))}%`, background: item.color }}
            />
          </div>
          <span className="risk-component-value">{Math.round(item.value * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function HazardSources({ references }: { references?: HazardReference[] }) {
  if (!references || references.length === 0) return null;
  return (
    <div className="hazard-sources">
      <h5>Sources</h5>
      <ol>
        {references.map((ref) => (
          <li key={ref.citation}>
            {ref.url ? (
              <a href={ref.url} target="_blank" rel="noopener noreferrer">
                {ref.citation}
              </a>
            ) : (
              ref.citation
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function HazardAnalysis() {
  const navigate = useNavigate();
  const [hazardType, setHazardType] = useState<HazardType>("flood");
  const [manualPoints, setManualPoints] = useState<ManualPoint[]>([
    { station: "A", lng: 0, lat: 0 },
    { station: "B", lng: 0, lat: 0 },
    { station: "C", lng: 0, lat: 0 },
  ]);
  const [coordinateSystem, setCoordinateSystem] = useState("wgs84");
  const [floodResult, setFloodResult] = useState<FloodResult | null>(null);
  const [erosionResult, setErosionResult] = useState<ErosionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [gisLoading, setGisLoading] = useState(false);
  const [showRaster, setShowRaster] = useState(false);
  const [returnPeriod, setReturnPeriod] = useState(100);
  const [jobProgress, setJobProgress] = useState<{ pct: number; stage: string } | null>(null);

  // Analysis runs as a background job (see hazards.py's async job endpoints) rather than one long
  // synchronous request, since the real work (several Earth Engine calls + local rendering) can
  // take longer than a client request timeout allows - this polls for status/progress instead.
  const pollHazardJob = useCallback(async (jobId: string): Promise<HazardJobStatus> => {
    const startedAt = Date.now();
    const timeoutMs = 3 * 60 * 1000;
    const pollIntervalMs = 1200;
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs));
      const res = await api.get<HazardJobStatus>(`/hazards/jobs/${jobId}`);
      const data = res.data;
      setJobProgress({ pct: data.progress_pct ?? 0, stage: data.stage || "" });
      if (data.status === "completed") return data;
      if (data.status === "failed") throw new Error(data.error_text || "Analysis failed");
    }
    throw new Error("Analysis is taking longer than expected. Please try again.");
  }, []);

  const updatePoint = (index: number, key: keyof ManualPoint, value: string | number) => {
    setManualPoints((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: value } as ManualPoint;
      return copy;
    });
  };

  const addPoint = () => {
    setManualPoints((prev) => [
      ...prev,
      { station: String.fromCharCode(65 + prev.length), lng: 0, lat: 0 },
    ]);
  };

  const removePoint = (index: number) => {
    if (manualPoints.length <= 3) {
      toast.error("Minimum 3 points required");
      return;
    }
    setManualPoints((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCoordinatesFromMap = useCallback((points: ManualPoint[]) => {
    if (coordinateSystem === "wgs84") {
      setManualPoints(points);
      return;
    }
    const converted = points.map((p) => {
      if (p.lng === 0 && p.lat === 0) return p;
      const [x, y] = fromWGS84(p.lng, p.lat, coordinateSystem);
      return { station: p.station, lng: x, lat: y };
    });
    setManualPoints(converted);
  }, [coordinateSystem]);

  const closeRing = (pts: number[][]) => {
    if (pts.length < 3) return pts;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const same = first[0] === last[0] && first[1] === last[1];
    return same ? pts : [...pts, first];
  };

  const finalCoords = useMemo(() => {
    const valid = manualPoints.filter((p) => p.lng !== 0 || p.lat !== 0);
    if (valid.length >= 3) {
      const pts = valid.map((p) => {
        if (coordinateSystem === "wgs84") {
          return [Number(p.lng), Number(p.lat)];
        }
        const [lng, lat] = toWGS84(Number(p.lng), Number(p.lat), coordinateSystem);
        return [lng, lat];
      });
      return closeRing(pts);
    }
    return null;
  }, [manualPoints, coordinateSystem]);

  const mapCoordinates = useMemo(() => {
    if (coordinateSystem === "wgs84") return manualPoints;
    return manualPoints.map((p) => {
      if (p.lng === 0 && p.lat === 0) return p;
      const [lng, lat] = toWGS84(p.lng, p.lat, coordinateSystem);
      return { station: p.station, lng, lat };
    });
  }, [manualPoints, coordinateSystem]);

  // Local elevation points from a CSV upload with a height/elevation column (same upload flow
  // CoordinateInput already supports) - when present, erosion recomputes slope directly from
  // these instead of the global 30m DEM, and flood surfaces a relative-elevation data point.
  const localElevationPoints = useMemo(() => {
    const withHeight = manualPoints.filter(
      (p) => (p.lng !== 0 || p.lat !== 0) && p.height !== undefined && p.height !== null && Number.isFinite(Number(p.height)),
    );
    if (withHeight.length < 3) return [];
    return withHeight.map((p) => {
      if (coordinateSystem === "wgs84") {
        return { lng: Number(p.lng), lat: Number(p.lat), elevation_m: Number(p.height) };
      }
      const [lng, lat] = toWGS84(Number(p.lng), Number(p.lat), coordinateSystem);
      return { lng, lat, elevation_m: Number(p.height) };
    });
  }, [manualPoints, coordinateSystem]);

  const buildHazardJobBody = (outputType: "preview" | "pdf" | "gis-export") => {
    const boundary = { type: "Polygon", coordinates: [finalCoords] };
    return {
      geometry: boundary,
      show_raster: showRaster,
      return_period: returnPeriod,
      local_elevation_points: localElevationPoints,
      output_type: outputType,
    };
  };

  const triggerBrowserDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const runAnalysis = async () => {
    if (!finalCoords) {
      toast.error("Enter at least 3 valid coordinate points");
      return;
    }
    try {
      setLoading(true);
      setJobProgress({ pct: 0, stage: "Starting analysis..." });
      const created = await api.post<HazardJobStatus>(`/hazards/${hazardType}/analyze`, buildHazardJobBody("preview"));
      const job = await pollHazardJob(created.data.id);
      if (hazardType === "flood") setFloodResult(job.result);
      else setErosionResult(job.result);
      toast.success(`${hazardType === "flood" ? "Flood" : "Erosion"} risk analysis complete`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : `Failed to run ${hazardType} analysis`);
    } finally {
      setLoading(false);
      setJobProgress(null);
    }
  };

  const downloadPdf = async () => {
    if (!finalCoords) return;
    try {
      setPdfLoading(true);
      setJobProgress({ pct: 0, stage: "Starting report..." });
      const created = await api.post<HazardJobStatus>(`/hazards/${hazardType}/analyze`, buildHazardJobBody("pdf"));
      const job = await pollHazardJob(created.data.id);
      if (!job.download_url) throw new Error("Report finished but no file was returned.");
      const fileRes = await api.get(job.download_url, { responseType: "blob" });
      const blob = new Blob([fileRes.data], { type: fileRes.headers["content-type"] || "application/pdf" });
      triggerBrowserDownload(blob, hazardType === "flood" ? "flood_risk_report.pdf" : "erosion_risk_report.pdf");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setPdfLoading(false);
      setJobProgress(null);
    }
  };

  const downloadGis = async () => {
    if (!finalCoords) return;
    try {
      setGisLoading(true);
      setJobProgress({ pct: 0, stage: "Starting export..." });
      const created = await api.post<HazardJobStatus>(`/hazards/${hazardType}/analyze`, buildHazardJobBody("gis-export"));
      const job = await pollHazardJob(created.data.id);
      if (!job.download_url) throw new Error("Export finished but no file was returned.");
      const fileRes = await api.get(job.download_url, { responseType: "blob" });
      const blob = new Blob([fileRes.data], { type: fileRes.headers["content-type"] || "application/zip" });
      triggerBrowserDownload(blob, hazardType === "flood" ? "flood_hazard_gis_export.zip" : "erosion_hazard_gis_export.zip");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to export GIS data");
    } finally {
      setGisLoading(false);
      setJobProgress(null);
    }
  };

  const result = hazardType === "flood" ? floodResult : erosionResult;

  const componentItems = useMemo(() => {
    if (hazardType === "flood" && floodResult) {
      if (floodResult.flood_data_source === "local_terrain_proxy") {
        return [
          { label: "Low-lying terrain", value: floodResult.terrain_depression_score ?? 0, color: "#b45309" },
          { label: "Flatness", value: floodResult.terrain_flatness_score ?? 0, color: "#f59e0b" },
          { label: "Drainage proximity", value: floodResult.terrain_drainage_score ?? 0, color: "#fbbf24" },
        ];
      }
      return [
        { label: "Depth", value: floodResult.depth_score ?? 0, color: "#1d4ed8" },
        { label: "Inundation", value: floodResult.inundation_score ?? 0, color: "#0ea5e9" },
        { label: "River proximity", value: floodResult.river_proximity_score ?? 0, color: "#38bdf8" },
      ];
    }
    if (hazardType === "erosion" && erosionResult) {
      return [
        { label: "Slope", value: erosionResult.slope_score ?? 0, color: "#f97316" },
        { label: "Bare ground", value: erosionResult.vegetation_score ?? 0, color: "#eab308" },
        { label: "Drainage concentration", value: erosionResult.drainage_score ?? 0, color: "#dc2626" },
      ];
    }
    return [];
  }, [hazardType, floodResult, erosionResult]);

  return (
    <div className="hazard-container">
      <Toaster position="top-right" />

      <HazardProgressOverlay
        visible={loading || pdfLoading || gisLoading}
        progressPct={jobProgress?.pct ?? 0}
        stageText={jobProgress?.stage ?? ""}
        hazardType={hazardType}
      />

      <header className="hazard-header">
        <button className="back-btn" onClick={() => navigate("/")}>Back</button>
        <h1 className="hazard-title">Hazard Risk Analysis</h1>
        <div className="hazard-type-tabs">
          <button
            type="button"
            className={`hazard-type-tab ${hazardType === "flood" ? "active" : ""}`}
            onClick={() => setHazardType("flood")}
          >
            Flood Risk
          </button>
          <button
            type="button"
            className={`hazard-type-tab ${hazardType === "erosion" ? "active" : ""}`}
            onClick={() => setHazardType("erosion")}
          >
            Erosion Risk
          </button>
        </div>
      </header>

      <div className="hazard-content">
        <div className="hazard-left">
          <div className="hazard-card">
            <h3>Plot Boundary</h3>
            <p className="hazard-subtext">
              Draw or input coordinates to analyze {hazardType === "flood" ? "flood" : "erosion"} risk. Screening-level only.
            </p>
            <CoordinateInput
              points={manualPoints}
              onUpdatePoint={updatePoint}
              onRemovePoint={removePoint}
              onAddPoint={addPoint}
              onBulkUpload={(pts) => setManualPoints(pts)}
              coordinateSystem={coordinateSystem}
              onCoordinateSystemChange={setCoordinateSystem}
            />
            {localElevationPoints.length > 0 && (
              <p className="hazard-elevation-hint">
                {localElevationPoints.length} surveyed elevation points detected — will be used for{" "}
                {hazardType === "erosion" ? "local slope calculation" : "a site elevation comparison"} instead of global data only.
              </p>
            )}
          </div>

          <div className="hazard-actions">
            <button className="btn-primary" onClick={runAnalysis} disabled={loading}>
              {loading ? "Running..." : `Run ${hazardType === "flood" ? "Flood" : "Erosion"} Analysis`}
            </button>
            {hazardType === "flood" && (
              <label className="hazard-select">
                Return Period
                <select
                  value={returnPeriod}
                  onChange={(e) => setReturnPeriod(Number(e.target.value))}
                >
                  <option value={10}>RP10</option>
                  <option value={20}>RP20</option>
                  <option value={50}>RP50</option>
                  <option value={100}>RP100</option>
                  <option value={200}>RP200</option>
                  <option value={500}>RP500</option>
                </select>
              </label>
            )}
            <label className="hazard-toggle">
              <input
                type="checkbox"
                checked={showRaster}
                onChange={(e) => setShowRaster(e.target.checked)}
              />
              Show local risk raster (advanced)
            </label>
          </div>

          {hazardType === "flood" && floodResult && (
            <div className="hazard-card">
              <h3>Flood Risk Summary</h3>
              <div className="risk-score">
                <div>
                  <span className="risk-label">Risk Score</span>
                  <span className="risk-value">{floodResult.data_available === false ? "—" : `${floodResult.risk_score}%`}</span>
                </div>
                <span className={`risk-chip ${riskChipClass(floodResult.risk_class)}`}>{floodResult.risk_class}</span>
              </div>
              {!!floodResult.buildings_total && floodResult.data_available !== false && (
                <div className="hazard-buildings-callout">
                  <strong>{floodResult.buildings_threatened}</strong> of <strong>{floodResult.buildings_total}</strong> buildings
                  {" "}{floodResult.flood_data_source === "local_terrain_proxy" ? "sit on susceptible ground" : "sit in the flood zone"}
                </div>
              )}
              {floodResult.data_available !== false && floodResult.flood_data_source === "local_terrain_proxy" && (
                <div className="risk-stat-grid">
                  <div className="risk-stat-card">
                    <strong>{floodResult.terrain_slope_deg ?? "N/A"}°</strong>
                    <span>Slope</span>
                  </div>
                  <div className="risk-stat-card">
                    <strong>{floodResult.terrain_depression_m ?? "N/A"}</strong>
                    <span>Rel. Elevation (m)</span>
                  </div>
                  <div className="risk-stat-card">
                    <strong>{floodResult.distance_to_river_m ?? "N/A"}</strong>
                    <span>Dist. to Drainage (m)</span>
                  </div>
                </div>
              )}
              {floodResult.data_available !== false && floodResult.flood_data_source !== "local_terrain_proxy" && (
                <div className="risk-stat-grid">
                  <div className="risk-stat-card">
                    <strong>{floodResult.mean_depth_m}</strong>
                    <span>Mean Depth (m)</span>
                  </div>
                  <div className="risk-stat-card">
                    <strong>{floodResult.max_depth_m}</strong>
                    <span>Max Depth (m)</span>
                  </div>
                  <div className="risk-stat-card">
                    <strong>{floodResult.inundation_percent}%</strong>
                    <span>Inundation</span>
                  </div>
                  <div className="risk-stat-card">
                    <strong>{floodResult.distance_to_river_m ?? "N/A"}</strong>
                    <span>Dist. to River (m)</span>
                  </div>
                </div>
              )}
              {floodResult.data_available !== false && componentItems.length > 0 && (
                <>
                  <h4 className="risk-components-title">Score components</h4>
                  <ComponentBars items={componentItems} />
                </>
              )}
              <p className={floodResult.flood_data_source === "local_terrain_proxy" ? "hazard-note hazard-note--proxy" : "hazard-note"}>
                {floodResult.note}
              </p>
              {floodResult.data_available === false && (
                <p className="hazard-warning">
                  No flood hazard data is available for this location — both GloFAS river flood modeling and the local terrain-based estimate were unable to produce a result here.
                </p>
              )}
              {floodResult.local_elevation_used && floodResult.relative_elevation_m != null && (
                <p className="hazard-insight">
                  Site elevation note: your surveyed points average{" "}
                  {Math.abs(floodResult.relative_elevation_m).toFixed(1)} m{" "}
                  {floodResult.relative_elevation_m < -0.3 ? "below" : floodResult.relative_elevation_m > 0.3 ? "above" : "close to"}{" "}
                  the surrounding terrain
                  {floodResult.relative_elevation_m < -0.3 ? " — low-lying sites are more prone to ponding and slow drainage." : "."}
                </p>
              )}
              <div className="hazard-method">
                <h4>How this is computed</h4>
                <p>{floodResult.method}</p>
                <p>Return period: {floodResult.return_period} years.</p>
                <p>Analysis buffer: {floodResult.buffer_m} m around the plot.</p>
                <p>Screening only — verify with local surveys and authorities.</p>
                <HazardSources references={floodResult.references} />
              </div>
              <div className="hazard-export-row">
                <button className="btn-outline" onClick={downloadPdf} disabled={pdfLoading}>
                  {pdfLoading ? "Preparing..." : "Download PDF Report"}
                </button>
                <button className="btn-outline" onClick={downloadGis} disabled={gisLoading}>
                  {gisLoading ? "Preparing..." : "Export GIS Data"}
                </button>
              </div>
            </div>
          )}

          {hazardType === "erosion" && erosionResult && (
            <div className="hazard-card">
              <h3>Erosion Risk Summary</h3>
              <div className="risk-score">
                <div>
                  <span className="risk-label">Risk Score</span>
                  <span className="risk-value">{erosionResult.data_available === false ? "—" : `${erosionResult.risk_score}%`}</span>
                </div>
                <span className={`risk-chip ${riskChipClass(erosionResult.risk_class)}`}>{erosionResult.risk_class}</span>
              </div>
              {!!erosionResult.buildings_total && erosionResult.data_available !== false && (
                <div className="hazard-buildings-callout">
                  <strong>{erosionResult.buildings_threatened}</strong> of <strong>{erosionResult.buildings_total}</strong> buildings
                  {" "}sit on erosion-prone slopes
                </div>
              )}
              {erosionResult.data_available !== false && (
                <div className="risk-stat-grid">
                  <div className="risk-stat-card">
                    <strong>{erosionResult.mean_slope_deg}°</strong>
                    <span>Mean Slope</span>
                  </div>
                  <div className="risk-stat-card">
                    <strong>{erosionResult.max_slope_deg}°</strong>
                    <span>Max Slope</span>
                  </div>
                  <div className="risk-stat-card">
                    <strong>{erosionResult.mean_ndvi}</strong>
                    <span>Vegetation (NDVI)</span>
                  </div>
                  <div className="risk-stat-card">
                    <strong>{erosionResult.distance_to_drainage_m}</strong>
                    <span>Dist. to Drainage (m)</span>
                  </div>
                </div>
              )}
              {erosionResult.data_available !== false && componentItems.length > 0 && (
                <>
                  <h4 className="risk-components-title">Score components</h4>
                  <ComponentBars items={componentItems} />
                </>
              )}
              <p className="hazard-note">{erosionResult.note}</p>
              {erosionResult.slope_source === "local_survey" && (
                <p className="hazard-insight">
                  Slope computed from your uploaded survey points — a more accurate local measurement than the global elevation model.
                </p>
              )}
              {erosionResult.slope_source === "global_dem" && (
                <p className="hazard-insight hazard-insight--muted">
                  Slope estimated from a global 30m elevation model. Upload your own surveyed elevation points (with a height column) for a more precise measurement.
                </p>
              )}
              {erosionResult.data_available === false && (
                <p className="hazard-warning">
                  No elevation data was found for this location.
                </p>
              )}
              <div className="hazard-method">
                <h4>How this is computed</h4>
                <p>{erosionResult.method}</p>
                <p>Analysis buffer: {erosionResult.buffer_m} m around the plot.</p>
                <p>Screening only — verify with a geotechnical survey before development.</p>
                <HazardSources references={erosionResult.references} />
              </div>
              <div className="hazard-export-row">
                <button className="btn-outline" onClick={downloadPdf} disabled={pdfLoading}>
                  {pdfLoading ? "Preparing..." : "Download PDF Report"}
                </button>
                <button className="btn-outline" onClick={downloadGis} disabled={gisLoading}>
                  {gisLoading ? "Preparing..." : "Export GIS Data"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="hazard-right">
          <div className="hazard-map">
            <Suspense fallback={<div className="hazard-empty">Loading map...</div>}>
              <MapViewEnhanced coordinates={mapCoordinates} onCoordinatesDrawn={handleCoordinatesFromMap} />
            </Suspense>
          </div>
          <div className="hazard-overlay">
            <h3>{hazardType === "flood" ? "Flood Risk Overlay" : "Erosion Risk Overlay"}</h3>
            {result?.overlay ? (
              <>
                {/* Both hazard maps now bake their own legend, scale bar, and north arrow into
                    the rendered image, so the separate CSS/JSON-driven ones are no longer shown. */}
                <HazardInteractiveOverlay
                  src={result.overlay}
                  alt={`${hazardType} risk overlay`}
                  interactive={result.interactive}
                />
                <div className="hazard-buffer">Buffer: {result.buffer_m} m</div>
              </>
            ) : (
              <div className="hazard-empty">Run analysis to see overlay</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
