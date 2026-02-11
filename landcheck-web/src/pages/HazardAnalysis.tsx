import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { api } from "../api/client";
import MapViewEnhanced from "../components/MapViewEnhanced";
import CoordinateInput from "../components/CoordinateInput";
import { fromWGS84, toWGS84 } from "../utils/coordinateConverter";
import "../styles/hazard-analysis.css";

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
};

type FloodResult = {
  risk_score: number;
  risk_class: string;
  mean_depth_m: number;
  max_depth_m: number;
  inundation_percent: number;
  distance_to_river_m?: number;
  overlay: string;
  note: string;
  buffer_m: number;
  method: string;
  legend: { label: string; color: string }[];
  return_period: number;
  data_available?: boolean;
};

export default function HazardAnalysis() {
  const navigate = useNavigate();
  const [manualPoints, setManualPoints] = useState<ManualPoint[]>([
    { station: "A", lng: 0, lat: 0 },
    { station: "B", lng: 0, lat: 0 },
    { station: "C", lng: 0, lat: 0 },
  ]);
  const [coordinateSystem, setCoordinateSystem] = useState("wgs84");
  const [result, setResult] = useState<FloodResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showRaster, setShowRaster] = useState(false);
  const [returnPeriod, setReturnPeriod] = useState(100);

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

  const runFloodAnalysis = async () => {
    if (!finalCoords) {
      toast.error("Enter at least 3 valid coordinate points");
      return;
    }
    try {
      setLoading(true);
      const boundary = { type: "Polygon", coordinates: [finalCoords] };
      const res = await api.post("/hazards/flood/preview", {
        geometry: boundary,
        show_raster: showRaster,
        return_period: returnPeriod,
      });
      setResult(res.data);
      toast.success("Flood risk analysis complete");
    } catch (err) {
      console.error(err);
      toast.error("Failed to run flood analysis");
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!finalCoords) return;
    try {
      setPdfLoading(true);
      const boundary = { type: "Polygon", coordinates: [finalCoords] };
      const res = await api.post(
        "/hazards/flood/pdf",
        { geometry: boundary, show_raster: showRaster, return_period: returnPeriod },
        { responseType: "blob" },
      );
      const blob = new Blob([res.data], { type: res.headers["content-type"] });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "flood_risk_report.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error("Failed to download PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="hazard-container">
      <Toaster position="top-right" />

      <header className="hazard-header">
        <button className="back-btn" onClick={() => navigate("/")}>Back</button>
        <h1 className="hazard-title">Flood Hazard Analysis</h1>
        <div className="hazard-badge">Beta</div>
      </header>

      <div className="hazard-content">
        <div className="hazard-left">
          <div className="hazard-card">
            <h3>Plot Boundary</h3>
            <p className="hazard-subtext">
              Draw or input coordinates to analyze flood risk. Screening-level only.
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
          </div>

          <div className="hazard-actions">
            <button className="btn-primary" onClick={runFloodAnalysis} disabled={loading}>
              {loading ? "Running..." : "Run Flood Analysis"}
            </button>
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
            <label className="hazard-toggle">
              <input
                type="checkbox"
                checked={showRaster}
                onChange={(e) => setShowRaster(e.target.checked)}
              />
              Show local risk raster (advanced)
            </label>
          </div>

          {result && (
            <div className="hazard-card">
              <h3>Risk Summary</h3>
              <div className="risk-score">
                <div>
                  <span className="risk-label">Risk Score</span>
                  <span className="risk-value">{result.risk_score}%</span>
                </div>
                <span className={`risk-chip ${result.risk_class.toLowerCase()}`}>{result.risk_class}</span>
              </div>
              <div className="risk-breakdown">
                <div>
                  <span>Mean Depth (m)</span>
                  <strong>{result.mean_depth_m}</strong>
                </div>
                <div>
                  <span>Max Depth (m)</span>
                  <strong>{result.max_depth_m}</strong>
                </div>
                <div>
                  <span>Inundation (%)</span>
                  <strong>{result.inundation_percent}%</strong>
                </div>
                <div>
                  <span>Distance to River (m)</span>
                  <strong>{result.distance_to_river_m ?? "N/A"}</strong>
                </div>
              </div>
              <p className="hazard-note">{result.note}</p>
              {result.data_available === false && (
                <p className="hazard-warning">
                  No flood depth data was found for this plot at the selected return period.
                </p>
              )}
              <div className="hazard-method">
                <h4>How this is computed</h4>
                <p>{result.method}</p>
                <p>Return period: {result.return_period} years.</p>
                <p>Analysis buffer: {result.buffer_m} m around the plot.</p>
                <p>Screening only — verify with local surveys and authorities.</p>
              </div>
              <button className="btn-outline" onClick={downloadPdf} disabled={pdfLoading}>
                {pdfLoading ? "Preparing..." : "Download PDF Report"}
              </button>
            </div>
          )}
        </div>

        <div className="hazard-right">
          <div className="hazard-map">
            <MapViewEnhanced coordinates={mapCoordinates} onCoordinatesDrawn={handleCoordinatesFromMap} />
          </div>
          <div className="hazard-overlay">
            <h3>Flood Risk Overlay</h3>
            {result?.overlay ? (
              <>
                <img src={result.overlay} alt="Flood risk overlay" />
                <div className="hazard-north" aria-hidden="true">
                  <div className="north-arrow" />
                  <span>N</span>
                </div>
                <div className="hazard-legend">
                  <div className="legend-title">Legend</div>
                  {result.legend?.map((item) => (
                    <div key={item.label} className="legend-row">
                      <span className="legend-swatch" style={{ background: item.color }} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
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
