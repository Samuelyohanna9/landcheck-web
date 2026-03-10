import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import toast, { Toaster } from "react-hot-toast";
import MapViewEnhanced from "../components/MapViewEnhanced";
import CoordinateInput from "../components/CoordinateInput";
import SurveyPreview from "../components/SurveyPreview";
import FeatureOverrideModal from "../components/FeatureOverrideModal";
import { fromWGS84, toWGS84 } from "../utils/coordinateConverter";
import "../styles/survey-plan.css";

type PlotMeta = {
  title_text: string;
  location_text: string;
  lga_text: string;
  state_text: string;
  surveyor_name: string;
  surveyor_rank: string;
  certification_statement: string;
  scale_text: string;
  paper_size: string;
  template_name: "general" | "adamawa_osg";
  adamawa_rof_no: string;
  adamawa_owner_name: string;
  adamawa_authority_title: string;
  adamawa_authority_date_text: string;
  adamawa_control_point_name: string;
  adamawa_northing: string;
  adamawa_easting: string;
  adamawa_elevation: string;
  adamawa_origin_text: string;
  adamawa_topo_sheet_text: string;
  adamawa_computation_no: string;
  adamawa_cadastral_sheet_no: string;
  adamawa_plan_no: string;
  adamawa_surveyed_by_text: string;
  adamawa_disclaimer_text: string;
};

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
};

type PreviewType = "survey" | "orthophoto" | "topomap";
type TopoSource = "opentopomap" | "userdata";
type NorthArrowStyle = "classic" | "triangle" | "compass" | "chevron" | "orienteering" | "star";
type NorthArrowColor = "black" | "blue";
type BeaconStyle = "circle" | "square" | "triangle" | "diamond" | "cross";
type RoadWidthOption = "2" | "4" | "6" | "8" | "10" | "12" | "15" | "20" | "30";

const DEFAULT_CERTIFICATION_STATEMENT =
  "I hereby certify that this survey plan is a true representation of the survey executed by me and conforms with the regulations of surveying profession.";
const SCALE_PRESETS = [250, 500, 1000, 2000, 5000];
const MIN_SCALE_DENOMINATOR = 100;
const MAX_SCALE_DENOMINATOR = 50000;
const DEFAULT_TEMPLATE_NAME: PlotMeta["template_name"] = "general";
const DEFAULT_ADAMAWA_AUTHORITY_TITLE = "SURVEYOR GENERAL";
const DEFAULT_ADAMAWA_AUTHORITY_DATE = "November, 2024";
const DEFAULT_ADAMAWA_ORIGIN_TEXT = "ORIGIN:- WGS 84 UTM ZONE 33N";
const DEFAULT_ADAMAWA_TOPO_SHEET_TEXT = "BASED ON GIREI TOPO SHEET 197 NE";
const DEFAULT_ADAMAWA_DISCLAIMER_TEXT =
  "Detail shewn not the result of accurate survey. All bearing and distances shewn on this plan have been computed from registered Co-ordinates.";

const parseScaleDenominator = (scaleText: string): number => {
  const digits = String(scaleText || "").replace(/[^0-9]/g, "");
  const parsed = Number.parseInt(digits || "1000", 10);
  if (!Number.isFinite(parsed)) return 1000;
  return Math.min(MAX_SCALE_DENOMINATOR, Math.max(MIN_SCALE_DENOMINATOR, parsed));
};

const STEPS = [
  { id: 1, title: "Enter Coordinates", description: "Input plot boundary points" },
  { id: 2, title: "Preview & Details", description: "Review and add survey info" },
  { id: 3, title: "Export", description: "Download your documents" },
];

export default function SurveyPlan() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);

  // Coordinates state
  const [manualPoints, setManualPoints] = useState<ManualPoint[]>([
    { station: "A", lng: 0, lat: 0 },
    { station: "B", lng: 0, lat: 0 },
    { station: "C", lng: 0, lat: 0 },
  ]);
  const [coordinateSystem, setCoordinateSystem] = useState("wgs84");

  // Plot state
  const [loading, setLoading] = useState(false);
  const [plotId, setPlotId] = useState<number | null>(null);
  const [features, setFeatures] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [orthophotoUrl, setOrthophotoUrl] = useState<string | null>(null);
  const [orthophotoLoading, setOrthophotoLoading] = useState(false);
  const [topoMapUrl, setTopoMapUrl] = useState<string | null>(null);
  const [topoMapLoading, setTopoMapLoading] = useState(false);
  const [downloadLoadingKey, setDownloadLoadingKey] = useState<string | null>(null);
  const [hasHeightData, setHasHeightData] = useState(false);
  const [previewType, setPreviewType] = useState<PreviewType>("survey");
  const [topoSource, setTopoSource] = useState<TopoSource>("opentopomap");
  const [northArrowStyle, setNorthArrowStyle] = useState<NorthArrowStyle>("classic");
  const [northArrowColor, setNorthArrowColor] = useState<NorthArrowColor>("black");
  const [beaconStyle, setBeaconStyle] = useState<BeaconStyle>("circle");
  const [roadWidth, setRoadWidth] = useState<RoadWidthOption>("10");
  const [scaleDraft, setScaleDraft] = useState<string>("1000");
  const [newRoadWidth, setNewRoadWidth] = useState<RoadWidthOption>("10");
  const [showFeatureEditor, setShowFeatureEditor] = useState(false);
  const [featureType, setFeatureType] = useState<"road" | "building" | "river" | "fence">("road");
  const [featureAction, setFeatureAction] = useState<"add" | "delete" | "update">("add");
  const [roadName, setRoadName] = useState("");
  const previewRequestId = useRef(0);
  const orthophotoRequestId = useRef(0);
  const topoRequestId = useRef(0);

  // Survey metadata
  const [meta, setMeta] = useState<PlotMeta>({
    title_text: "SURVEY PLAN",
    location_text: "",
    lga_text: "",
    state_text: "",
    surveyor_name: "",
    surveyor_rank: "",
    certification_statement: DEFAULT_CERTIFICATION_STATEMENT,
    scale_text: "1 : 1000",
    paper_size: "A4",
    template_name: DEFAULT_TEMPLATE_NAME,
    adamawa_rof_no: "",
    adamawa_owner_name: "",
    adamawa_authority_title: DEFAULT_ADAMAWA_AUTHORITY_TITLE,
    adamawa_authority_date_text: DEFAULT_ADAMAWA_AUTHORITY_DATE,
    adamawa_control_point_name: "",
    adamawa_northing: "",
    adamawa_easting: "",
    adamawa_elevation: "",
    adamawa_origin_text: DEFAULT_ADAMAWA_ORIGIN_TEXT,
    adamawa_topo_sheet_text: DEFAULT_ADAMAWA_TOPO_SHEET_TEXT,
    adamawa_computation_no: "",
    adamawa_cadastral_sheet_no: "",
    adamawa_plan_no: "",
    adamawa_surveyed_by_text: "",
    adamawa_disclaimer_text: DEFAULT_ADAMAWA_DISCLAIMER_TEXT,
  });

  useEffect(() => {
    setScaleDraft(String(parseScaleDenominator(meta.scale_text)));
  }, [meta.scale_text]);

  const commitScaleDraft = useCallback(() => {
    const parsed = parseScaleDenominator(scaleDraft);
    setScaleDraft(String(parsed));
    setMeta((m) => ({ ...m, scale_text: `1 : ${parsed}` }));
  }, [scaleDraft]);

  // Coordinate helpers
  const updatePoint = (index: number, key: keyof ManualPoint, value: string | number) => {
    setManualPoints((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: value } as ManualPoint;
      return copy;
    });
  };

  // Generate station name: A, B, C, ... Z, AA, AB, ... AZ, BA, ... (unlimited)
  const getStationName = (index: number): string => {
    let name = "";
    let num = index;
    do {
      name = String.fromCharCode(65 + (num % 26)) + name;
      num = Math.floor(num / 26) - 1;
    } while (num >= 0);
    return name;
  };

  const removePoint = (index: number) => {
    if (manualPoints.length <= 3) {
      toast.error("Minimum 3 points required");
      return;
    }
    setManualPoints((prev) => prev.filter((_, i) => i !== index));
  };

  const addPoint = () => {
    setManualPoints((prev) => [
      ...prev,
      {
        station: getStationName(prev.length),
        lng: 0,
        lat: 0,
      },
    ]);
  };

  // Handle bulk upload from CSV/Excel
  const handleBulkUpload = (points: ManualPoint[]) => {
    if (points.length < 3) {
      toast.error("Need at least 3 points for a valid plot boundary");
      return;
    }
    setManualPoints(points);

    // Check if points have height data
    const pointsWithHeight = points.filter(p => p.height !== undefined && p.height !== null);
    if (pointsWithHeight.length > 0) {
      setHasHeightData(true);
      toast.success(`Loaded ${points.length} coordinates with elevation data!`);
    } else {
      setHasHeightData(false);
      toast.success(`Loaded ${points.length} coordinates from file`);
    }
  };

  // Handle coordinates drawn on map (always comes in WGS84)
  // Convert to selected coordinate system for display
  const handleCoordinatesFromMap = useCallback((points: ManualPoint[]) => {
    if (coordinateSystem === "wgs84") {
      // No conversion needed
      setManualPoints(points);
    } else {
      // Convert from WGS84 to selected coordinate system
      const convertedPoints = points.map((p) => {
        if (p.lng === 0 && p.lat === 0) {
          return p;
        }
        const [x, y] = fromWGS84(p.lng, p.lat, coordinateSystem);
        return {
          station: p.station,
          lng: x, // Easting
          lat: y, // Northing
        };
      });
      setManualPoints(convertedPoints);
    }
  }, [coordinateSystem]);

  const closeRing = (pts: number[][]) => {
    if (pts.length < 3) return pts;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const same = first[0] === last[0] && first[1] === last[1];
    return same ? pts : [...pts, first];
  };

  // Final coordinates for backend (always in WGS84)
  const finalCoords = useMemo(() => {
    const validPoints = manualPoints.filter(
      (p) => p.lng !== 0 || p.lat !== 0
    );
    if (validPoints.length >= 3) {
      // Convert to WGS84 if using projected coordinate system
      const pts = validPoints.map((p) => {
        if (coordinateSystem === "wgs84") {
          return [Number(p.lng), Number(p.lat)];
        }
        // Convert from projected to WGS84
        const [lng, lat] = toWGS84(Number(p.lng), Number(p.lat), coordinateSystem);
        return [lng, lat];
      });
      return closeRing(pts);
    }
    return null;
  }, [manualPoints, coordinateSystem]);

  const stationNames = useMemo(() => {
    return manualPoints.map((p) => (p.station || "").trim());
  }, [manualPoints]);

  // Check if coordinates are valid
  const hasValidCoords = useMemo(() => {
    const validPoints = manualPoints.filter(
      (p) => (p.lng !== 0 || p.lat !== 0) && !isNaN(p.lng) && !isNaN(p.lat)
    );
    return validPoints.length >= 3;
  }, [manualPoints]);

  // Convert form coordinates to WGS84 for map display
  const mapCoordinates = useMemo(() => {
    if (coordinateSystem === "wgs84") {
      return manualPoints;
    }
    // Convert projected coordinates to WGS84 for map
    return manualPoints.map((p) => {
      if (p.lng === 0 && p.lat === 0) {
        return p;
      }
      const [lng, lat] = toWGS84(p.lng, p.lat, coordinateSystem);
      return {
        station: p.station,
        lng,
        lat,
      };
    });
  }, [manualPoints, coordinateSystem]);

  // Save plot to localStorage for dashboard
  const savePlotToStorage = (id: number) => {
    const STORAGE_KEY = "landcheck_plots";
    const stored = localStorage.getItem(STORAGE_KEY);
    const plots = stored ? JSON.parse(stored) : [];

    const newPlot = {
      id,
      createdAt: new Date().toISOString(),
      title: meta.title_text,
      location: meta.location_text,
      scale: meta.scale_text,
      coordinates: manualPoints,
    };

    // Add to beginning of list (most recent first)
    plots.unshift(newPlot);

    // Keep only last 50 plots
    if (plots.length > 50) {
      plots.pop();
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(plots));
  };

  // Create plot on backend
  const createPlot = async () => {
    if (!finalCoords) {
      toast.error("Enter at least 3 valid coordinate points");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/plots", {
        coordinates: finalCoords,
      });
      const id = res.data.plot_id ?? res.data.id;
      setPlotId(id);

      // Save to localStorage for dashboard
      savePlotToStorage(id);

      const featureRes = await api.get(`/plots/${id}/features`);
      setFeatures(featureRes.data);

      toast.success("Plot created successfully!");
      setCurrentStep(2);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create plot");
    } finally {
      setLoading(false);
    }
  };

  // Load preview image
  const loadPreview = useCallback(async () => {
    if (!plotId) return;

    const requestId = ++previewRequestId.current;
    setPreviewLoading(true);
    try {
      const payload = {
        title_text: meta.title_text,
        location_text: meta.location_text,
        lga_text: meta.lga_text,
        state_text: meta.state_text,
        scale_text: meta.scale_text,
        surveyor_name: meta.surveyor_name,
        surveyor_rank: meta.surveyor_rank,
        certification_statement: meta.certification_statement,
        station_names: stationNames,
        coordinate_system: coordinateSystem,
        paper_size: meta.paper_size,
        north_arrow_style: northArrowStyle,
        north_arrow_color: northArrowColor,
        beacon_style: beaconStyle,
        road_width_m: Number(roadWidth),
        template_name: meta.template_name,
        adamawa_rof_no: meta.adamawa_rof_no,
        adamawa_owner_name: meta.adamawa_owner_name,
        adamawa_authority_title: meta.adamawa_authority_title,
        adamawa_authority_date_text: meta.adamawa_authority_date_text,
        adamawa_control_point_name: meta.adamawa_control_point_name,
        adamawa_northing: meta.adamawa_northing,
        adamawa_easting: meta.adamawa_easting,
        adamawa_elevation: meta.adamawa_elevation,
        adamawa_origin_text: meta.adamawa_origin_text,
        adamawa_topo_sheet_text: meta.adamawa_topo_sheet_text,
        adamawa_computation_no: meta.adamawa_computation_no,
        adamawa_cadastral_sheet_no: meta.adamawa_cadastral_sheet_no,
        adamawa_plan_no: meta.adamawa_plan_no,
        adamawa_surveyed_by_text: meta.adamawa_surveyed_by_text,
        adamawa_disclaimer_text: meta.adamawa_disclaimer_text,
      };

      const res = await api.post(`/plots/${plotId}/report/preview`, payload, {
        responseType: "blob",
      });

      if (requestId !== previewRequestId.current) {
        return;
      }

      const url = URL.createObjectURL(res.data);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      console.error("Preview error:", err);
      toast.error("Failed to load preview");
    } finally {
      if (requestId === previewRequestId.current) {
        setPreviewLoading(false);
      }
    }
  }, [plotId, meta, stationNames, coordinateSystem, northArrowStyle, northArrowColor, beaconStyle, roadWidth]);

  // Debounce preview refresh while users type metadata.
  useEffect(() => {
    if (currentStep === 2 && plotId && previewType === "survey") {
      const timer = window.setTimeout(() => {
        loadPreview();
      }, 450);
      return () => window.clearTimeout(timer);
    }
  }, [currentStep, plotId, previewType, loadPreview]);

  // Load orthophoto preview (satellite imagery)
  const loadOrthophoto = useCallback(async () => {
    if (!plotId) return;

    const requestId = ++orthophotoRequestId.current;
    setOrthophotoLoading(true);
    try {
      const res = await api.post(`/plots/${plotId}/orthophoto/preview`, {
        scale_text: meta.scale_text,
        station_names: stationNames,
        coordinate_system: coordinateSystem,
        paper_size: meta.paper_size,
        use_topo_map: false, // Always satellite for orthophoto
        north_arrow_style: northArrowStyle,
        north_arrow_color: northArrowColor,
      }, {
        responseType: "blob",
      });

      if (requestId !== orthophotoRequestId.current) {
        return;
      }

      const url = URL.createObjectURL(res.data);
      setOrthophotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      console.error("Orthophoto preview error:", err);
      toast.error("Failed to load orthophoto preview");
    } finally {
      if (requestId === orthophotoRequestId.current) {
        setOrthophotoLoading(false);
      }
    }
  }, [plotId, meta.scale_text, stationNames, coordinateSystem, meta.paper_size, northArrowStyle, northArrowColor]);

  // Load topo map preview (OpenTopoMap tiles or user height data)
  const loadTopoMap = useCallback(async (source: "opentopomap" | "userdata" = "opentopomap") => {
    if (!plotId) return;

    const requestId = ++topoRequestId.current;
    setTopoMapLoading(true);

    try {
      const res = await api.post(`/plots/${plotId}/orthophoto/preview`, {
        scale_text: meta.scale_text,
        station_names: stationNames,
        coordinate_system: coordinateSystem,
        paper_size: meta.paper_size,
        use_topo_map: true, // Always topo for topo map
        topo_source: source, // "opentopomap" or "userdata"
        north_arrow_style: northArrowStyle,
        north_arrow_color: northArrowColor,
      }, {
        responseType: "blob",
      });

      if (requestId !== topoRequestId.current) {
        return;
      }

      const url = URL.createObjectURL(res.data);
      setTopoMapUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      console.error("Topo map preview error:", err);
      toast.error("Failed to load topo map preview");
    } finally {
      if (requestId === topoRequestId.current) {
        setTopoMapLoading(false);
      }
    }
  }, [plotId, meta.scale_text, stationNames, coordinateSystem, meta.paper_size, northArrowStyle, northArrowColor]);

  // Debounce orthophoto/topo refresh to avoid repeated heavy tile fetches.
  useEffect(() => {
    if (!plotId) return;
    if (currentStep !== 2 && currentStep !== 3) return;

    if (previewType === "orthophoto") {
      const timer = window.setTimeout(() => {
        loadOrthophoto();
      }, 500);
      return () => window.clearTimeout(timer);
    }

    if (previewType === "topomap") {
      const timer = window.setTimeout(() => {
        loadTopoMap(topoSource);
      }, 500);
      return () => window.clearTimeout(timer);
    }
  }, [
    plotId,
    currentStep,
    previewType,
    topoSource,
    meta.scale_text,
    meta.paper_size,
    northArrowStyle,
    northArrowColor,
    loadOrthophoto,
    loadTopoMap,
  ]);

  // Reset everything
  const resetAll = () => {
    setManualPoints([
      { station: "A", lng: 0, lat: 0 },
      { station: "B", lng: 0, lat: 0 },
      { station: "C", lng: 0, lat: 0 },
    ]);
    setCoordinateSystem("wgs84");
    setPlotId(null);
    setFeatures(null);
    setPreviewUrl(null);
    setOrthophotoUrl(null);
    setTopoMapUrl(null);
    setCurrentStep(1);
    setHasHeightData(false);
    setPreviewType("survey");
    setTopoSource("opentopomap");
    setNorthArrowStyle("classic");
    setNorthArrowColor("black");
    setBeaconStyle("circle");
    setRoadWidth("10");
    setMeta({
      title_text: "SURVEY PLAN",
      location_text: "",
      lga_text: "",
      state_text: "",
      surveyor_name: "",
      surveyor_rank: "",
      certification_statement: DEFAULT_CERTIFICATION_STATEMENT,
      scale_text: "1 : 1000",
      paper_size: "A4",
      template_name: DEFAULT_TEMPLATE_NAME,
      adamawa_rof_no: "",
      adamawa_owner_name: "",
      adamawa_authority_title: DEFAULT_ADAMAWA_AUTHORITY_TITLE,
      adamawa_authority_date_text: DEFAULT_ADAMAWA_AUTHORITY_DATE,
      adamawa_control_point_name: "",
      adamawa_northing: "",
      adamawa_easting: "",
      adamawa_elevation: "",
      adamawa_origin_text: DEFAULT_ADAMAWA_ORIGIN_TEXT,
      adamawa_topo_sheet_text: DEFAULT_ADAMAWA_TOPO_SHEET_TEXT,
      adamawa_computation_no: "",
      adamawa_cadastral_sheet_no: "",
      adamawa_plan_no: "",
      adamawa_surveyed_by_text: "",
      adamawa_disclaimer_text: DEFAULT_ADAMAWA_DISCLAIMER_TEXT,
    });
    toast("Reset completed");
  };

  const triggerBlobDownload = (blobData: BlobPart, contentType: string | undefined, filename: string) => {
    const blob = new Blob([blobData], { type: contentType || "application/octet-stream" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  // Download function for PDF endpoints that need JSON body
  const downloadWithJson = async (
    url: string,
    filename: string,
    loadingKey: string,
    useTopoMap = false,
    customTitle?: string
  ) => {
    if (downloadLoadingKey) return;
    setDownloadLoadingKey(loadingKey);
    try {
      // Use custom title if provided, otherwise use meta title
      const titleText = customTitle || meta.title_text;

      const payload = {
        title_text: titleText,
        location_text: meta.location_text,
        lga_text: meta.lga_text,
        state_text: meta.state_text,
        scale_text: meta.scale_text,
        surveyor_name: meta.surveyor_name,
        surveyor_rank: meta.surveyor_rank,
        certification_statement: meta.certification_statement,
        station_names: stationNames,
        coordinate_system: coordinateSystem,
        paper_size: meta.paper_size,
        use_topo_map: useTopoMap,
        north_arrow_style: northArrowStyle,
        north_arrow_color: northArrowColor,
        beacon_style: beaconStyle,
        road_width_m: Number(roadWidth),
        template_name: meta.template_name,
        adamawa_rof_no: meta.adamawa_rof_no,
        adamawa_owner_name: meta.adamawa_owner_name,
        adamawa_authority_title: meta.adamawa_authority_title,
        adamawa_authority_date_text: meta.adamawa_authority_date_text,
        adamawa_control_point_name: meta.adamawa_control_point_name,
        adamawa_northing: meta.adamawa_northing,
        adamawa_easting: meta.adamawa_easting,
        adamawa_elevation: meta.adamawa_elevation,
        adamawa_origin_text: meta.adamawa_origin_text,
        adamawa_topo_sheet_text: meta.adamawa_topo_sheet_text,
        adamawa_computation_no: meta.adamawa_computation_no,
        adamawa_cadastral_sheet_no: meta.adamawa_cadastral_sheet_no,
        adamawa_plan_no: meta.adamawa_plan_no,
        adamawa_surveyed_by_text: meta.adamawa_surveyed_by_text,
        adamawa_disclaimer_text: meta.adamawa_disclaimer_text,
      };

      const res = await api.post(url, payload, { responseType: "blob" });
      triggerBlobDownload(res.data, res.headers["content-type"], filename);

      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Failed to download file");
    } finally {
      setDownloadLoadingKey((prev) => (prev === loadingKey ? null : prev));
    }
  };

  const downloadWithGet = async (url: string, filename: string, loadingKey: string) => {
    if (downloadLoadingKey) return;
    setDownloadLoadingKey(loadingKey);
    try {
      const res = await api.get(url, { responseType: "blob" });
      triggerBlobDownload(res.data, res.headers["content-type"], filename);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Failed to download file");
    } finally {
      setDownloadLoadingKey((prev) => (prev === loadingKey ? null : prev));
    }
  };

  // Get feature counts from nested response structure
  const getFeatureCount = (type: string) => {
    if (!features) return 0;
    const insideCount = features.inside?.[type] || 0;
    const bufferCount = features.buffer?.[type] || 0;
    return insideCount + bufferCount;
  };

  const handleSaveOverride = async (payload: { feature_type: "road" | "building" | "river" | "fence"; action: "add" | "delete" | "update"; name?: string; width_m?: number; geojson: any }) => {
    if (!plotId) return;
    try {
      await api.post(`/plots/${plotId}/feature-overrides`, payload);
      toast.success("Feature saved");
      setShowFeatureEditor(false);
      setPreviewUrl(null);
      setOrthophotoUrl(null);
      setTopoMapUrl(null);
      setTimeout(() => {
        loadPreview();
        if (previewType === "orthophoto") loadOrthophoto();
        if (previewType === "topomap") loadTopoMap(topoSource);
      }, 250);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save feature");
    }
  };

  return (
    <div className="survey-container">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="survey-header">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        <h1 className="survey-title">Survey Plan Production</h1>
        <button className="reset-btn" onClick={resetAll}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Reset
        </button>
      </header>

      {/* Progress Stepper */}
      <div className="stepper">
        {STEPS.map((step, index) => (
          <div
            key={step.id}
            className={`step ${currentStep >= step.id ? "active" : ""} ${currentStep > step.id ? "completed" : ""}`}
          >
            <div className="step-indicator">
              {currentStep > step.id ? (
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                step.id
              )}
            </div>
            <div className="step-content">
              <span className="step-title">{step.title}</span>
              <span className="step-desc">{step.description}</span>
            </div>
            {index < STEPS.length - 1 && <div className="step-line" />}
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="survey-content">
        <FeatureOverrideModal
          isOpen={showFeatureEditor}
          onClose={() => setShowFeatureEditor(false)}
          onSave={handleSaveOverride}
          plotCoords={finalCoords}
          featureType={featureType}
          setFeatureType={setFeatureType}
          action={featureAction}
          setAction={setFeatureAction}
          roadName={roadName}
          setRoadName={setRoadName}
          roadWidth={newRoadWidth}
          setRoadWidth={setNewRoadWidth}
          plotId={plotId}
        />
        {/* Step 1: Coordinate Input */}
        {currentStep === 1 && (
          <div className="step-panel">
            <div className="panel-left">
              <CoordinateInput
                points={manualPoints}
                onUpdatePoint={updatePoint}
                onRemovePoint={removePoint}
                onAddPoint={addPoint}
                onBulkUpload={handleBulkUpload}
                disabled={loading}
                coordinateSystem={coordinateSystem}
                onCoordinateSystemChange={setCoordinateSystem}
              />
              <div className="action-bar">
                <button
                  className="btn-primary"
                  disabled={!hasValidCoords || loading}
                  onClick={createPlot}
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      Creating Plot...
                    </>
                  ) : (
                    <>
                      Create Plot & Continue
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="panel-right">
              <MapViewEnhanced
                coordinates={mapCoordinates}
                onCoordinatesDrawn={handleCoordinatesFromMap}
                disabled={loading}
              />
            </div>
          </div>
        )}

        {/* Step 2: Preview & Details */}
        {currentStep === 2 && (
          <div className="step-panel preview-panel">
            <div className="panel-left">
              {/* Features Summary - Horizontal Compact Layout (moved to top) */}
              {features && (
                <div className="features-bar">
                  <span className="features-bar-label">Detected:</span>
                  <div className="features-bar-items">
                    <div className="feature-chip building">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 21h18M5 21V7l8-4v18M13 21V3l6 3v15M9 9v.01M9 12v.01M9 15v.01M17 9v.01M17 12v.01M17 15v.01" />
                      </svg>
                      <span className="chip-count">{getFeatureCount("building")}</span>
                      <span className="chip-label">Buildings</span>
                    </div>
                    <div className="feature-chip road">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19L8 5M16 19L20 5M12 19V5M8 10H6M18 10h-2M8 14H6M18 14h-2" />
                      </svg>
                      <span className="chip-count">{getFeatureCount("road")}</span>
                      <span className="chip-label">Roads</span>
                    </div>
                    <div className="feature-chip river">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 7c3-2 6-2 9 0s6 2 9 0M3 12c3-2 6-2 9 0s6 2 9 0M3 17c3-2 6-2 9 0s6 2 9 0" />
                      </svg>
                      <span className="chip-count">{getFeatureCount("river")}</span>
                      <span className="chip-label">Rivers</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-section">
                <h3 className="section-title">Survey Details</h3>
                <div className="form-grid">
                  <div className="form-group full-width template-selector-group">
                    <label>Template</label>
                    <div className="template-selector">
                      <button
                        type="button"
                        className={`template-btn ${meta.template_name === "general" ? "active" : ""}`}
                        onClick={() => setMeta((m) => ({ ...m, template_name: "general" }))}
                      >
                        General
                      </button>
                      <button
                        type="button"
                        className={`template-btn ${meta.template_name === "adamawa_osg" ? "active" : ""}`}
                        onClick={() => {
                          setScaleDraft("2500");
                          setMeta((m) => ({
                            ...m,
                            template_name: "adamawa_osg",
                            paper_size: "A4",
                            scale_text: "1 : 2500",
                          }));
                        }}
                      >
                        Adamawa OSG
                      </button>
                    </div>
                    {meta.template_name === "adamawa_osg" && (
                      <span className="template-hint">
                        Adamawa OSG layout is locked to the official A4 survey sheet style.
                      </span>
                    )}
                  </div>
                  {meta.template_name === "general" ? (
                    <>
                      <div className="form-group">
                        <label>Title</label>
                        <input
                          value={meta.title_text}
                          onChange={(e) => setMeta((m) => ({ ...m, title_text: e.target.value }))}
                          placeholder="SURVEY PLAN"
                        />
                      </div>
                      <div className="form-group">
                        <label>Location</label>
                        <input
                          value={meta.location_text}
                          onChange={(e) => setMeta((m) => ({ ...m, location_text: e.target.value }))}
                          placeholder="Enter location"
                        />
                      </div>
                      <div className="form-group">
                        <label>LGA</label>
                        <input
                          value={meta.lga_text}
                          onChange={(e) => setMeta((m) => ({ ...m, lga_text: e.target.value }))}
                          placeholder="Local Government Area"
                        />
                      </div>
                      <div className="form-group">
                        <label>State</label>
                        <input
                          value={meta.state_text}
                          onChange={(e) => setMeta((m) => ({ ...m, state_text: e.target.value }))}
                          placeholder="Enter state"
                        />
                      </div>
                      <div className="form-group">
                        <label>Surveyor Name</label>
                        <input
                          value={meta.surveyor_name}
                          onChange={(e) => setMeta((m) => ({ ...m, surveyor_name: e.target.value }))}
                          placeholder="Enter surveyor name"
                        />
                      </div>
                      <div className="form-group">
                        <label>Rank</label>
                        <input
                          value={meta.surveyor_rank}
                          onChange={(e) => setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))}
                          placeholder="Surveyor rank"
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Certification Statement (Editable)</label>
                        <textarea
                          value={meta.certification_statement}
                          onChange={(e) => setMeta((m) => ({ ...m, certification_statement: e.target.value }))}
                          placeholder={DEFAULT_CERTIFICATION_STATEMENT}
                          rows={3}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="form-group">
                        <label>R of O Number</label>
                        <input
                          value={meta.adamawa_rof_no}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_rof_no: e.target.value }))}
                          placeholder="ADS50530"
                        />
                      </div>
                      <div className="form-group">
                        <label>Owner Name</label>
                        <input
                          value={meta.adamawa_owner_name}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_owner_name: e.target.value }))}
                          placeholder="NASIRU IBRAHIM BORNOMA"
                        />
                      </div>
                      <div className="form-group">
                        <label>Location (AT)</label>
                        <input
                          value={meta.location_text}
                          onChange={(e) => setMeta((m) => ({ ...m, location_text: e.target.value }))}
                          placeholder="SANGERE"
                        />
                      </div>
                      <div className="form-group">
                        <label>Local Government</label>
                        <input
                          value={meta.lga_text}
                          onChange={(e) => setMeta((m) => ({ ...m, lga_text: e.target.value }))}
                          placeholder="GIREI LOCAL GOVERNMENT"
                        />
                      </div>
                      <div className="form-group">
                        <label>Authority Title</label>
                        <input
                          value={meta.adamawa_authority_title}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_authority_title: e.target.value }))}
                          placeholder={DEFAULT_ADAMAWA_AUTHORITY_TITLE}
                        />
                      </div>
                      <div className="form-group">
                        <label>Authority Date</label>
                        <input
                          value={meta.adamawa_authority_date_text}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_authority_date_text: e.target.value }))}
                          placeholder={DEFAULT_ADAMAWA_AUTHORITY_DATE}
                        />
                      </div>
                      <div className="form-group">
                        <label>Control Point Name</label>
                        <input
                          value={meta.adamawa_control_point_name}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_control_point_name: e.target.value }))}
                          placeholder="SCAD/4163"
                        />
                      </div>
                      <div className="form-group">
                        <label>Northing</label>
                        <input
                          value={meta.adamawa_northing}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_northing: e.target.value }))}
                          placeholder="1034441.881m"
                        />
                      </div>
                      <div className="form-group">
                        <label>Easting</label>
                        <input
                          value={meta.adamawa_easting}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_easting: e.target.value }))}
                          placeholder="227835.738m"
                        />
                      </div>
                      <div className="form-group">
                        <label>Elevation (Z)</label>
                        <input
                          value={meta.adamawa_elevation}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_elevation: e.target.value }))}
                          placeholder="256.100m"
                        />
                      </div>
                      <div className="form-group">
                        <label>Computation No</label>
                        <input
                          value={meta.adamawa_computation_no}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_computation_no: e.target.value }))}
                          placeholder="ADS50530"
                        />
                      </div>
                      <div className="form-group">
                        <label>Cadastral Sheet No</label>
                        <input
                          value={meta.adamawa_cadastral_sheet_no}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_cadastral_sheet_no: e.target.value }))}
                          placeholder="07"
                        />
                      </div>
                      <div className="form-group">
                        <label>Plan No</label>
                        <input
                          value={meta.adamawa_plan_no}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_plan_no: e.target.value }))}
                          placeholder=""
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Origin Text</label>
                        <input
                          value={meta.adamawa_origin_text}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_origin_text: e.target.value }))}
                          placeholder={DEFAULT_ADAMAWA_ORIGIN_TEXT}
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Topo Sheet Text</label>
                        <input
                          value={meta.adamawa_topo_sheet_text}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_topo_sheet_text: e.target.value }))}
                          placeholder={DEFAULT_ADAMAWA_TOPO_SHEET_TEXT}
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Surveyed By Text</label>
                        <input
                          value={meta.adamawa_surveyed_by_text}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_surveyed_by_text: e.target.value }))}
                          placeholder="Surveyed by Surv. ABEL FRANCIS Senior Surveyor February, 2024"
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Disclaimer Text</label>
                        <textarea
                          value={meta.adamawa_disclaimer_text}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_disclaimer_text: e.target.value }))}
                          rows={2}
                          placeholder={DEFAULT_ADAMAWA_DISCLAIMER_TEXT}
                        />
                      </div>
                    </>
                  )}
                  <div className="form-group scale-group">
                    <label>Scale</label>
                    <div className="scale-input-wrapper">
                      <span className="scale-prefix">1 :</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={scaleDraft}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "");
                          setScaleDraft(val);
                        }}
                        onBlur={commitScaleDraft}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitScaleDraft();
                          }
                        }}
                        className="scale-number-input"
                        placeholder="1000"
                        aria-label="Scale denominator"
                      />
                    </div>
                    <span className="scale-helper">Type only the number after `1 :` (example: `1000`).</span>
                    <div className="scale-presets">
                      {SCALE_PRESETS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`scale-preset-btn ${parseScaleDenominator(meta.scale_text) === s ? "active" : ""}`}
                          onClick={() => {
                            setScaleDraft(String(s));
                            setMeta((m) => ({ ...m, scale_text: `1 : ${s}` }));
                          }}
                        >
                          1:{s}
                        </button>
                      ))}
                    </div>
                  </div>
                  {meta.template_name === "adamawa_osg" ? (
                    <div className="form-group paper-size-group">
                      <label>Paper Size</label>
                      <div className="paper-size-fixed">A4 (fixed by Adamawa OSG template)</div>
                    </div>
                  ) : (
                    <div className="form-group paper-size-group">
                      <label>Paper Size</label>
                      <div className="paper-size-presets">
                        {["A4", "A3", "A2", "A1", "A0"].map((size) => (
                          <button
                            key={size}
                            type="button"
                            className={`paper-size-btn ${meta.paper_size === size ? "active" : ""}`}
                            onClick={() => setMeta((m) => ({ ...m, paper_size: size }))}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                      <span className="paper-size-hint">
                        {meta.paper_size === "A4" && "Standard (210 x 297 mm)"}
                        {meta.paper_size === "A3" && "Large (297 x 420 mm)"}
                        {meta.paper_size === "A2" && "Extra Large (420 x 594 mm)"}
                        {meta.paper_size === "A1" && "Poster (594 x 841 mm)"}
                        {meta.paper_size === "A0" && "Maximum (841 x 1189 mm)"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="edit-feature-bar">
                  <button className="btn-secondary" onClick={loadPreview} disabled={previewLoading}>
                    {previewLoading ? "Updating..." : "Update Preview"}
                  </button>
                  <button className="btn-outline" onClick={() => setShowFeatureEditor(true)} disabled={!plotId}>
                    Edit Features
                  </button>
                </div>
              </div>

              <div className="action-bar">
                <button className="btn-outline" onClick={() => setCurrentStep(1)}>
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Back to Coordinates
                </button>
                <button className="btn-primary" onClick={() => setCurrentStep(3)}>
                  Continue to Export
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="panel-right preview-container">
              <SurveyPreview
                previewType={previewType}
                onPreviewTypeChange={setPreviewType}
                topoSource={topoSource}
                onTopoSourceChange={setTopoSource}
                northArrowStyle={northArrowStyle}
                northArrowColor={northArrowColor}
                beaconStyle={beaconStyle}
                roadWidth={roadWidth}
                onNorthArrowStyleChange={(value) => setNorthArrowStyle(value as NorthArrowStyle)}
                onNorthArrowColorChange={(value) => setNorthArrowColor(value as NorthArrowColor)}
                onBeaconStyleChange={(value) => setBeaconStyle(value as BeaconStyle)}
                onRoadWidthChange={(value) => setRoadWidth(value as RoadWidthOption)}
                paperSize={meta.paper_size}
                surveyPreviewUrl={previewUrl}
                orthophotoPreviewUrl={orthophotoUrl}
                topoMapPreviewUrl={topoMapUrl}
                loading={previewLoading}
                orthophotoLoading={orthophotoLoading}
                topoMapLoading={topoMapLoading}
                hasHeightData={hasHeightData}
              />
            </div>
          </div>
        )}

        {/* Step 3: Export */}
        {currentStep === 3 && plotId && (
          <div className="step-panel export-panel">
            <div className="panel-left">
              <div className="export-section">
                <h3 className="section-title">Download Documents</h3>
                <p className="section-desc">Your survey documents are ready. Choose the formats you need:</p>

                <div className="export-grid">
                  {/* Survey Plan PDF */}
                  <div className="export-card">
                    <div className="export-icon pdf">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M7 21h10a2 2 0 002-2V9l-5-5H7a2 2 0 00-2 2v13a2 2 0 002 2z" />
                        <path d="M14 4v5h5" />
                        <path d="M9 13h6M9 17h4" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>Survey Plan PDF</h4>
                      <p>Complete survey plan with all details</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithJson(
                          `/plots/${plotId}/report/pdf`,
                          `plot_${plotId}_survey_plan.pdf`,
                          "survey_pdf",
                          false,
                          "SURVEY PLAN"
                        )
                      }
                    >
                      {downloadLoadingKey === "survey_pdf" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Orthophoto PDF */}
                  <div className="export-card">
                    <div className="export-icon ortho">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>Orthophoto PDF</h4>
                      <p>Aerial imagery with plot overlay</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithJson(
                          `/plots/${plotId}/orthophoto/pdf`,
                          `plot_${plotId}_orthophoto.pdf`,
                          "orthophoto_pdf",
                          false,
                          "ORTHOPHOTO"
                        )
                      }
                    >
                      {downloadLoadingKey === "orthophoto_pdf" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* DWG File */}
                  <div className="export-card">
                    <div className="export-icon dwg">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M8 15l2-2 2 2 2-2 2 2" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>DWG/DXF File</h4>
                      <p>CAD-compatible survey drawing</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithGet(
                          `/plots/${plotId}/survey-plan/dwg`,
                          `plot_${plotId}_survey_plan.dxf`,
                          "dwg"
                        )
                      }
                    >
                      {downloadLoadingKey === "dwg" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download DWG</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Shapefile ZIP */}
                  <div className="export-card">
                    <div className="export-icon topo">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
                        <path d="M9 3v15M15 6v15" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>Shapefile (ZIP)</h4>
                      <p>GIS boundary export for ArcGIS/QGIS</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithGet(
                          `/plots/${plotId}/survey-plan/shapefile`,
                          `plot_${plotId}_survey_plan_shapefile.zip`,
                          "shapefile_zip"
                        )
                      }
                    >
                      {downloadLoadingKey === "shapefile_zip" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download ZIP</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Topo Map PDF */}
                  <div className="export-card">
                    <div className="export-icon topo">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                        <circle cx="12" cy="9" r="2.5" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>Topo Map PDF</h4>
                      <p>Terrain contours with plot overlay</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithJson(
                          `/plots/${plotId}/orthophoto/pdf`,
                          `plot_${plotId}_topomap.pdf`,
                          "topomap_pdf",
                          true,
                          "TOPO MAP"
                        )
                      }
                    >
                      {downloadLoadingKey === "topomap_pdf" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Back Computation */}
                  <div className="export-card">
                    <div className="export-icon calc">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="4" y="2" width="16" height="20" rx="2" />
                        <line x1="8" y1="6" x2="16" y2="6" />
                        <line x1="8" y1="10" x2="16" y2="10" />
                        <line x1="8" y1="14" x2="12" y2="14" />
                        <line x1="8" y1="18" x2="10" y2="18" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>Back Computation</h4>
                      <p>Survey calculation sheet</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithJson(
                          `/plots/${plotId}/back-computation/pdf`,
                          `plot_${plotId}_back_computation.pdf`,
                          "back_computation_pdf"
                        )
                      }
                    >
                      {downloadLoadingKey === "back_computation_pdf" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="action-bar">
                <button className="btn-outline" onClick={() => setCurrentStep(2)}>
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Back to Preview
                </button>
                <button className="btn-primary" onClick={() => navigate("/")}>
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Complete & Return Home
                </button>
              </div>
            </div>
            <div className="panel-right preview-container">
              <SurveyPreview
                previewType={previewType}
                onPreviewTypeChange={setPreviewType}
                topoSource={topoSource}
                onTopoSourceChange={setTopoSource}
                northArrowStyle={northArrowStyle}
                northArrowColor={northArrowColor}
                beaconStyle={beaconStyle}
                roadWidth={roadWidth}
                onNorthArrowStyleChange={(value) => setNorthArrowStyle(value as NorthArrowStyle)}
                onNorthArrowColorChange={(value) => setNorthArrowColor(value as NorthArrowColor)}
                onBeaconStyleChange={(value) => setBeaconStyle(value as BeaconStyle)}
                onRoadWidthChange={(value) => setRoadWidth(value as RoadWidthOption)}
                paperSize={meta.paper_size}
                surveyPreviewUrl={previewUrl}
                orthophotoPreviewUrl={orthophotoUrl}
                topoMapPreviewUrl={topoMapUrl}
                loading={false}
                orthophotoLoading={orthophotoLoading}
                topoMapLoading={topoMapLoading}
                hasHeightData={hasHeightData}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
