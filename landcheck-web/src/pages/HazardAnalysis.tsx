import { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";
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

type AnalysisMode = "satellite" | "local" | "hybrid";

const ANALYSIS_MODES: { value: AnalysisMode; label: string; description: string }[] = [
  { value: "satellite", label: "Satellite / DEM", description: "Fully automatic — satellite imagery and global elevation data only, no upload needed." },
  { value: "local", label: "Local Data", description: "Runs primarily off your uploaded survey/geotechnical data, falling back to satellite/DEM only for what's missing." },
  { value: "hybrid", label: "Hybrid", description: "Tell us what local data you have — we'll use satellite/DEM to fill in the rest, combined into one result." },
];

type ConfidenceInfo = {
  score: number;
  tier: "Low" | "Moderate" | "High" | "Very High" | string;
  factor_sources: Record<string, string>;
  notes: string[];
};

const SOURCE_LABELS: Record<string, string> = {
  local_survey: "Your survey points",
  user_input: "Your input",
  glofas: "GloFAS (global flood model)",
  local_terrain_proxy: "Local terrain proxy (DEM)",
  satellite_ndvi: "Satellite (vegetation)",
  satellite_hydrosheds: "Satellite (drainage network)",
  global_dem: "Global elevation model (30m)",
  not_available: "Not available",
};

const FACTOR_LABELS: Record<string, string> = {
  slope: "Slope", vegetation: "Vegetation cover", drainage: "Drainage proximity", gully: "Gully susceptibility",
  depth: "Flood depth", inundation: "Inundation extent", river_proximity: "River proximity",
  depression: "Low-lying terrain", flatness: "Flatness", runoff: "Runoff",
};

function confidenceChipClass(tier: string) {
  const normalized = tier.toLowerCase().replace(/\s+/g, "-");
  return normalized;
}

function ConfidencePanel({ confidence, dataGaps }: { confidence?: ConfidenceInfo | null; dataGaps?: string[] }) {
  if (!confidence) return null;
  return (
    <div className="hazard-confidence">
      <div className="hazard-confidence-header">
        <span>Input Data Confidence</span>
        <span className={`confidence-chip ${confidenceChipClass(confidence.tier)}`}>
          {confidence.score}% · {confidence.tier}
        </span>
      </div>
      <p className="hazard-confidence-hint">
        Reflects how direct and well-sampled the inputs behind this score are — not a claim of accuracy against real-world
        outcomes, since there's no measured dataset to validate against.
      </p>
      <ul className="hazard-source-list">
        {Object.entries(confidence.factor_sources).map(([factor, source]) => (
          <li key={factor}>
            <span>{FACTOR_LABELS[factor] ?? factor}</span>
            <span className="hazard-source-value">{SOURCE_LABELS[source] ?? source}</span>
          </li>
        ))}
      </ul>
      {confidence.notes.map((note) => (
        <p key={note} className="hazard-confidence-hint">{note}</p>
      ))}
      {!!dataGaps?.length && (
        <div className="hazard-data-gaps">
          <h5>Filled from satellite/DEM</h5>
          <ul>
            {dataGaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type LegendItem = { label: string; color: string };

type HazardReference = { short?: string; citation: string; url?: string };

type ScsRunoff = {
  curve_number: number;
  hydrologic_soil_group: string;
  site_type: string;
  potential_retention_mm: number;
  initial_abstraction_mm: number;
  design_rainfall_mm: number;
  runoff_mm: number;
  runoff_coefficient: number;
};

type SoilData = {
  siltVfsPct?: number;
  clayPct?: number;
  sandPct?: number;
  organicMatterPct?: number;
  soilStructureCode?: number;
  soilPermeabilityCode?: number;
  cohesionKpa?: number;
  frictionAngleDeg?: number;
  plasticityIndex?: number;
};

// Maps this component's camelCase soil-data state to the snake_case field names the /hazards
// endpoints read off each uploaded point (see hazards.py's _OPTIONAL_SOIL_FIELDS).
const SOIL_FIELD_KEY_MAP: Record<keyof SoilData, string> = {
  siltVfsPct: "silt_vfs_pct",
  clayPct: "clay_pct",
  sandPct: "sand_pct",
  organicMatterPct: "organic_matter_pct",
  soilStructureCode: "soil_structure_code",
  soilPermeabilityCode: "soil_permeability_code",
  cohesionKpa: "cohesion_kpa",
  frictionAngleDeg: "friction_angle_deg",
  plasticityIndex: "plasticity_index",
};

const SITE_TYPES: { value: string; label: string }[] = [
  { value: "bare_soil", label: "Bare / cleared soil" },
  { value: "agricultural", label: "Agricultural / farmland" },
  { value: "residential_low_density", label: "Residential (low density)" },
  { value: "residential_high_density", label: "Residential (high density)" },
  { value: "commercial_paved", label: "Commercial / paved" },
];

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
  scs_runoff?: ScsRunoff | null;
  analysis_mode?: AnalysisMode;
  data_sources?: Record<string, string>;
  confidence?: ConfidenceInfo | null;
  local_data_gaps?: string[];
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
  local_soil_data_available?: boolean;
  gully_susceptibility_index?: number | null;
  k_factor?: number | null;
  analysis_mode?: AnalysisMode;
  data_sources?: Record<string, string>;
  confidence?: ConfidenceInfo | null;
  local_data_gaps?: string[];
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
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("hybrid");
  const [hybridFlags, setHybridFlags] = useState({ elevation: false, soilTexture: false, geotechnical: false, siteRainfall: false });
  const [showLocalData, setShowLocalData] = useState(false);
  const [soilData, setSoilData] = useState<SoilData>({});
  const [siteType, setSiteType] = useState("residential_low_density");
  const [designRainfallMm, setDesignRainfallMm] = useState<string>("");
  const [shapefileLoading, setShapefileLoading] = useState(false);
  const shapefileInputRef = useRef<HTMLInputElement>(null);

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

  const hasSoilData = useMemo(
    () => Object.values(soilData).some((v) => v !== undefined && Number.isFinite(v)),
    [soilData],
  );

  // Elevation-carrying points still need >=3 to triangulate a local slope surface, so the hint
  // below only counts those. Below that threshold, elevation still rides along per-point (see
  // localElevationPoints) - it just won't drive local-slope/TIN, matching the backend's fallback.
  const elevationSurveyPointCount = useMemo(
    () =>
      manualPoints.filter(
        (p) => (p.lng !== 0 || p.lat !== 0) && p.height !== undefined && p.height !== null && Number.isFinite(Number(p.height)),
      ).length,
    [manualPoints],
  );

  // Every valid boundary point, carrying whatever it has: a surveyed elevation (from a CSV height
  // column), and/or the site-level soil/geotechnical reading below (same value attached to every
  // point, since it's one reading for the whole site, not per-station) - the backend picks up
  // whichever optional fields are present per point rather than requiring a fixed shape.
  const localElevationPoints = useMemo(() => {
    const valid = manualPoints.filter((p) => p.lng !== 0 || p.lat !== 0);
    if (valid.length === 0) return [];
    return valid.map((p) => {
      const [lng, lat] =
        coordinateSystem === "wgs84" ? [Number(p.lng), Number(p.lat)] : toWGS84(Number(p.lng), Number(p.lat), coordinateSystem);
      const entry: Record<string, number> = { lng, lat };
      if (p.height !== undefined && p.height !== null && Number.isFinite(Number(p.height))) {
        entry.elevation_m = Number(p.height);
      }
      if (hasSoilData) {
        (Object.keys(soilData) as (keyof SoilData)[]).forEach((key) => {
          const value = soilData[key];
          if (value === undefined || !Number.isFinite(value)) return;
          entry[SOIL_FIELD_KEY_MAP[key]] = value;
        });
      }
      return entry;
    });
  }, [manualPoints, coordinateSystem, soilData, hasSoilData]);

  const updateSoilField = (key: keyof SoilData, raw: string) => {
    setSoilData((prev) => ({ ...prev, [key]: raw === "" ? undefined : Number(raw) }));
  };

  const handleShapefileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setShapefileLoading(true);
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<{ boundary: any }>("/hazards/upload-boundary", formData);
      const geom = res.data?.boundary;
      const ring: number[][] | null =
        geom?.type === "Polygon" ? geom.coordinates?.[0] : geom?.type === "MultiPolygon" ? geom.coordinates?.[0]?.[0] : null;
      if (!ring || ring.length < 3) throw new Error("No usable polygon found in the uploaded file.");
      const first = ring[0];
      const last = ring[ring.length - 1];
      const isClosed = ring.length > 1 && first[0] === last[0] && first[1] === last[1];
      const openRing = isClosed ? ring.slice(0, -1) : ring;
      const imported: ManualPoint[] = openRing.map(([lng, lat], index) => {
        const station = String.fromCharCode(65 + (index % 26));
        if (coordinateSystem === "wgs84") return { station, lng, lat };
        const [x, y] = fromWGS84(lng, lat, coordinateSystem);
        return { station, lng: x, lat: y };
      });
      setManualPoints(imported);
      toast.success(`Imported ${imported.length} boundary points from ${file.name}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to parse the uploaded boundary file");
    } finally {
      setShapefileLoading(false);
      if (shapefileInputRef.current) shapefileInputRef.current.value = "";
    }
  };

  const buildHazardJobBody = (outputType: "preview" | "pdf" | "gis-export") => {
    const boundary = { type: "Polygon", coordinates: [finalCoords] };
    return {
      geometry: boundary,
      show_raster: showRaster,
      return_period: returnPeriod,
      local_elevation_points: analysisMode === "satellite" ? [] : localElevationPoints,
      site_type: hazardType === "flood" && analysisMode !== "satellite" ? siteType : undefined,
      design_rainfall_mm:
        hazardType === "flood" && analysisMode !== "satellite" && designRainfallMm !== "" ? Number(designRainfallMm) : undefined,
      analysis_mode: analysisMode,
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
            <h3>Analysis Mode</h3>
            <div className="hazard-mode-tabs">
              {ANALYSIS_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={`hazard-mode-tab ${analysisMode === mode.value ? "active" : ""}`}
                  onClick={() => setAnalysisMode(mode.value)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <p className="hazard-subtext">{ANALYSIS_MODES.find((m) => m.value === analysisMode)?.description}</p>
          </div>

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
            {elevationSurveyPointCount >= 3 && (
              <p className="hazard-elevation-hint">
                {elevationSurveyPointCount} surveyed elevation points detected — will be used for{" "}
                {hazardType === "erosion" ? "local slope calculation" : "a site elevation comparison"} instead of global data only.
              </p>
            )}
          </div>

          {analysisMode !== "satellite" && (
            <div className="hazard-card">
              <div className="hazard-local-data-header">
                <div>
                  <h3>Local Ground Data</h3>
                  <p className="hazard-subtext">
                    {analysisMode === "hybrid"
                      ? "Check off which local data you have — whatever's left unchecked is filled in automatically from satellite/DEM."
                      : "Upload a shapefile boundary and/or add a geotechnical or soil survey reading for this site — the analysis runs primarily off this data."}
                  </p>
                </div>
              </div>

              <div className="hazard-upload-section">
                <input
                  ref={shapefileInputRef}
                  type="file"
                  accept=".zip,.geojson,.json,.kml"
                  onChange={handleShapefileUpload}
                  disabled={shapefileLoading}
                  className="file-input-hidden"
                  id="hazard-shapefile-upload"
                />
                <label htmlFor="hazard-shapefile-upload" className={`hazard-upload-btn ${shapefileLoading ? "disabled" : ""}`}>
                  {shapefileLoading ? "Importing..." : "Upload Shapefile / GeoJSON / KML"}
                </label>
                <span className="hazard-upload-hint">Replaces the points above with the uploaded boundary</span>
              </div>

              {analysisMode === "hybrid" && (
                <div className="hazard-checklist">
                  <label className="hazard-checklist-item">
                    <input type="checkbox" checked={hybridFlags.elevation} onChange={(e) => setHybridFlags((f) => ({ ...f, elevation: e.target.checked }))} />
                    <span>I have an elevation survey</span>
                    {!hybridFlags.elevation && <em>→ will use global 30m DEM</em>}
                  </label>
                  <label className="hazard-checklist-item">
                    <input type="checkbox" checked={hybridFlags.soilTexture} onChange={(e) => setHybridFlags((f) => ({ ...f, soilTexture: e.target.checked }))} />
                    <span>I have soil texture data</span>
                    {!hybridFlags.soilTexture && <em>→ K-factor/HSG skipped</em>}
                  </label>
                  <label className="hazard-checklist-item">
                    <input type="checkbox" checked={hybridFlags.geotechnical} onChange={(e) => setHybridFlags((f) => ({ ...f, geotechnical: e.target.checked }))} />
                    <span>I have a geotechnical survey</span>
                    {!hybridFlags.geotechnical && <em>→ gully factor skipped</em>}
                  </label>
                  {hazardType === "flood" && (
                    <label className="hazard-checklist-item">
                      <input type="checkbox" checked={hybridFlags.siteRainfall} onChange={(e) => setHybridFlags((f) => ({ ...f, siteRainfall: e.target.checked }))} />
                      <span>I have site rainfall data</span>
                      {!hybridFlags.siteRainfall && <em>→ runoff estimate skipped</em>}
                    </label>
                  )}
                </div>
              )}

              {hybridFlags.elevation && analysisMode === "hybrid" && (
                <p className="hazard-elevation-hint">
                  Upload a CSV with a height/elevation column above (Plot Boundary card) to provide your elevation survey.
                </p>
              )}

              {(analysisMode === "local" || hybridFlags.soilTexture || hybridFlags.geotechnical) && (
                <button type="button" className="hazard-local-data-toggle" onClick={() => setShowLocalData((v) => !v)}>
                  {showLocalData ? "Hide" : "Add"} soil / geotechnical reading {hasSoilData ? "(added)" : ""}
                  <span className={`hazard-chevron ${showLocalData ? "open" : ""}`}>▾</span>
                </button>
              )}

              {showLocalData && (analysisMode === "local" || hybridFlags.soilTexture || hybridFlags.geotechnical) && (
                <div className="hazard-local-data-grid">
                  {(analysisMode === "local" || hybridFlags.soilTexture) && (
                    <>
                      <label className="hazard-field">
                        <span>Silt + V.Fine Sand (%)</span>
                        <input type="number" step="any" min={0} max={100} value={soilData.siltVfsPct ?? ""} onChange={(e) => updateSoilField("siltVfsPct", e.target.value)} />
                      </label>
                      <label className="hazard-field">
                        <span>Clay (%)</span>
                        <input type="number" step="any" min={0} max={100} value={soilData.clayPct ?? ""} onChange={(e) => updateSoilField("clayPct", e.target.value)} />
                      </label>
                      <label className="hazard-field">
                        <span>Sand (%)</span>
                        <input type="number" step="any" min={0} max={100} value={soilData.sandPct ?? ""} onChange={(e) => updateSoilField("sandPct", e.target.value)} />
                      </label>
                      <label className="hazard-field">
                        <span>Organic Matter (%)</span>
                        <input type="number" step="any" min={0} max={12} value={soilData.organicMatterPct ?? ""} onChange={(e) => updateSoilField("organicMatterPct", e.target.value)} />
                      </label>
                      <label className="hazard-field">
                        <span>Soil Structure (1-4)</span>
                        <select value={soilData.soilStructureCode ?? ""} onChange={(e) => updateSoilField("soilStructureCode", e.target.value)}>
                          <option value="">—</option>
                          <option value={1}>1 - Very fine granular</option>
                          <option value={2}>2 - Fine granular</option>
                          <option value={3}>3 - Coarse granular</option>
                          <option value={4}>4 - Blocky / platy / massive</option>
                        </select>
                      </label>
                      <label className="hazard-field">
                        <span>Permeability (1-6)</span>
                        <select value={soilData.soilPermeabilityCode ?? ""} onChange={(e) => updateSoilField("soilPermeabilityCode", e.target.value)}>
                          <option value="">—</option>
                          <option value={1}>1 - Rapid</option>
                          <option value={2}>2 - Moderate to rapid</option>
                          <option value={3}>3 - Moderate</option>
                          <option value={4}>4 - Slow to moderate</option>
                          <option value={5}>5 - Slow</option>
                          <option value={6}>6 - Very slow</option>
                        </select>
                      </label>
                    </>
                  )}
                  {(analysisMode === "local" || hybridFlags.geotechnical) && (
                    <>
                      <label className="hazard-field">
                        <span>Cohesion (kPa)</span>
                        <input type="number" step="any" min={0} value={soilData.cohesionKpa ?? ""} onChange={(e) => updateSoilField("cohesionKpa", e.target.value)} />
                      </label>
                      <label className="hazard-field">
                        <span>Friction Angle (°)</span>
                        <input type="number" step="any" min={0} max={45} value={soilData.frictionAngleDeg ?? ""} onChange={(e) => updateSoilField("frictionAngleDeg", e.target.value)} />
                      </label>
                      <label className="hazard-field">
                        <span>Plasticity Index</span>
                        <input type="number" step="any" min={0} value={soilData.plasticityIndex ?? ""} onChange={(e) => updateSoilField("plasticityIndex", e.target.value)} />
                      </label>
                    </>
                  )}
                </div>
              )}

              {hazardType === "flood" && (analysisMode === "local" || hybridFlags.siteRainfall) && (
                <div className="hazard-local-data-grid hazard-local-data-grid--flood">
                  <label className="hazard-field">
                    <span>Site Type</span>
                    <select value={siteType} onChange={(e) => setSiteType(e.target.value)}>
                      {SITE_TYPES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="hazard-field">
                    <span>Design Rainfall (mm)</span>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      placeholder="e.g. 100"
                      value={designRainfallMm}
                      onChange={(e) => setDesignRainfallMm(e.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

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
              {floodResult.scs_runoff && (
                <>
                  <div className="risk-stat-grid">
                    <div className="risk-stat-card">
                      <strong>{floodResult.scs_runoff.curve_number}</strong>
                      <span>Curve Number (HSG {floodResult.scs_runoff.hydrologic_soil_group})</span>
                    </div>
                    <div className="risk-stat-card">
                      <strong>{floodResult.scs_runoff.runoff_mm}</strong>
                      <span>Runoff (mm)</span>
                    </div>
                    <div className="risk-stat-card">
                      <strong>{Math.round(floodResult.scs_runoff.runoff_coefficient * 100)}%</strong>
                      <span>Runoff Coefficient</span>
                    </div>
                  </div>
                  <p className="hazard-insight">
                    A site-specific SCS/NRCS runoff estimate for a {floodResult.scs_runoff.design_rainfall_mm}mm storm on this{" "}
                    {floodResult.scs_runoff.site_type.replace(/_/g, " ")} site{" "}
                    {floodResult.flood_data_source === "local_terrain_proxy"
                      ? "was blended into the risk score above."
                      : "is shown for reference — the risk score above still reflects the GloFAS river-flood simulation."}
                  </p>
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
              <ConfidencePanel confidence={floodResult.confidence} dataGaps={floodResult.local_data_gaps} />
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
              {erosionResult.local_soil_data_available && (
                <div className="risk-stat-grid">
                  {erosionResult.gully_susceptibility_index != null && (
                    <div className="risk-stat-card">
                      <strong>{Math.round(erosionResult.gully_susceptibility_index * 100)}%</strong>
                      <span>Gully Susceptibility</span>
                    </div>
                  )}
                  {erosionResult.k_factor != null && (
                    <div className="risk-stat-card">
                      <strong>{erosionResult.k_factor}</strong>
                      <span>Soil Erodibility (K-factor)</span>
                    </div>
                  )}
                </div>
              )}
              {erosionResult.local_soil_data_available && (
                <p className="hazard-insight">
                  Your uploaded geotechnical/soil reading was used to refine this score — a Nigeria-calibrated gully-susceptibility
                  factor {erosionResult.gully_susceptibility_index != null ? "was blended into the risk score above" : "and/or K-factor was computed"}.
                </p>
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
              <ConfidencePanel confidence={erosionResult.confidence} dataGaps={erosionResult.local_data_gaps} />
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
