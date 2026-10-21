import { Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateRibbon, { type EstateRibbonTab } from "../../components/estates/EstateRibbon";
import Spinner from "../../components/estates/EstateSpinner";
import HazardInteractiveOverlay, { type HazardInteractiveMeta } from "../../components/HazardInteractiveOverlay";
import { lazyWithChunkRecovery } from "../../utils/lazyWithChunkRecovery";
import "../../styles/hazard-analysis.css";

const HazardFlood3DView = lazyWithChunkRecovery(() => import("../../components/HazardFlood3DView"));

type FloodEngineResult = {
  overlay: string | null;
  interactive: HazardInteractiveMeta | null;
  risk_class?: string;
  risk_score?: number;
  data_available?: boolean;
  mean_depth_m?: number;
  max_depth_m?: number;
};
type FloodResult = { river: FloodEngineResult; floodplain: FloodEngineResult; rainfall: FloodEngineResult };
type ErosionResult = { overlay: string | null; interactive: HazardInteractiveMeta | null; risk_class?: string };
type HazardFullResult = { flood?: FloodResult; erosion?: ErosionResult };
type HazardJobStatus = { id: string; status: "queued" | "running" | "completed" | "failed"; stage: string | null; error_text: string | null; result: HazardFullResult | null };

// Replica of the LandCheck Hazard product's 3D flood view, rehosted inside the Estate dashboard -
// same underlying components (HazardFlood3DView / HazardInteractiveOverlay), reskinned with
// Estate's own card/chip styling instead of the standalone product's own page chrome. Reached from
// a plot's row (instant - its full result, overlay included, is already stored) or from the Estate
// boundary itself (recomputed on demand via /hazards/boundary-map, since that heavier data is
// deliberately not kept in permanent storage - see _slim_hazard_result's memory-safety note).
export default function EstateHazardMapPage() {
  const { estateId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const plotId = searchParams.get("plot_id");
  const plotNumber = searchParams.get("plot_number");
  const initialHazardType = searchParams.get("hazard_type") === "erosion" ? "erosion" : "flood";

  const [estateName, setEstateName] = useState("");
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<HazardFullResult | null>(null);
  const [hazardType, setHazardType] = useState<"flood" | "erosion">(initialHazardType);
  const [floodEngine, setFloodEngine] = useState<"river" | "floodplain" | "rainfall">("river");
  const [show3D, setShow3D] = useState(false);

  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  }, [estateId]);

  useEffect(() => {
    if (!estateId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setResult(null);

    const run = async () => {
      try {
        if (plotId) {
          const response = await api.get<HazardFullResult>(`/estates/plots/${plotId}/hazards`);
          if (!cancelled) setResult(response.data);
          return;
        }
        setStage("Starting...");
        const created = await api.post<HazardJobStatus>(`/estates/${estateId}/hazards/boundary-map`);
        let job = created.data;
        const startedAt = Date.now();
        while (job.status === "queued" || job.status === "running") {
          if (Date.now() - startedAt > 10 * 60 * 1000) throw new Error("This is taking longer than expected. Please try again.");
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
          const polled = await api.get<HazardJobStatus>(`/hazards/jobs/${job.id}`);
          job = polled.data;
          if (!cancelled) setStage(job.stage || "");
        }
        if (job.status === "failed") throw new Error(job.error_text || "Could not build the map view.");
        if (!cancelled) setResult(job.result);
      } catch (err) {
        if (!cancelled) setError(await extractApiErrorMessage(err, "The map view could not be loaded."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [estateId, plotId]);

  const floodResult = result?.flood;
  const erosionResult = result?.erosion;

  useEffect(() => {
    if (!result) return;
    if (hazardType === "flood" && !floodResult && erosionResult) setHazardType("erosion");
    else if (hazardType === "erosion" && !erosionResult && floodResult) setHazardType("flood");
  }, [result, floodResult, erosionResult, hazardType]);

  const activeFloodEngine = floodResult ? (floodEngine === "rainfall" ? floodResult.rainfall : floodEngine === "floodplain" ? floodResult.floodplain : floodResult.river) : null;
  const displayOverlay = hazardType === "flood" ? activeFloodEngine?.overlay ?? null : erosionResult?.overlay ?? null;
  const displayInteractive = hazardType === "flood" ? activeFloodEngine?.interactive ?? null : erosionResult?.interactive ?? null;

  // Same honesty rule the standalone product applies: River has a real modelled depth (GloFAS);
  // Floodplain/Rainfall only produce a 0-100 susceptibility score, so their 3D "water" height is
  // explicitly illustrative, flagged so the view never implies a depth prediction that was never
  // actually computed.
  const flood3DWater = useMemo(() => {
    if (!floodResult || !activeFloodEngine) return { depthM: 0, modelled: false, dataAvailable: true };
    if (floodEngine === "river") {
      const river = floodResult.river;
      const dataAvailable = river.data_available !== false;
      const depth = river.mean_depth_m ?? river.max_depth_m ?? null;
      return { depthM: dataAvailable && depth != null ? depth : 0, modelled: dataAvailable && depth != null, dataAvailable };
    }
    const score = activeFloodEngine.risk_score ?? 0;
    return { depthM: 0.4 + (score / 100) * 3.2, modelled: false, dataAvailable: true };
  }, [floodResult, activeFloodEngine, floodEngine]);

  if (!estateId) return null;

  const ribbonTabs: EstateRibbonTab[] = [
    {
      key: "home", label: "Home",
      groups: [{ key: "nav", label: "View", buttons: [{ key: "back", label: "Back to Hazard Analysis", icon: "hazard", onClick: () => navigate(`/estates/${estateId}/hazards`) }] }],
    },
  ];

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="hazard" recentActivity={activity}>
      <EstateRibbon tabs={ribbonTabs} />
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">{plotId ? `Plot ${plotNumber || plotId} - hazard map` : `${estateName || "Estate"} boundary - hazard map`}</h3>
          </div>
          {loading ? (
            <p className="edash-tab-empty"><Spinner size={14} /> {stage || "Loading..."}</p>
          ) : error ? (
            <p className="edash-tab-empty" style={{ color: "var(--edash-danger, #b3261e)" }}>{error}</p>
          ) : !result || (!floodResult && !erosionResult) ? (
            <p className="edash-tab-empty">No hazard result available to map yet. Run hazard analysis first.</p>
          ) : (
            <>
              {(floodResult || erosionResult) && (
                <label className="edash-field" style={{ maxWidth: 220, marginBottom: 14 }}>
                  <span>Hazard</span>
                  <select value={hazardType} onChange={(event) => setHazardType(event.target.value as "flood" | "erosion")}>
                    {floodResult && <option value="flood">Flood</option>}
                    {erosionResult && <option value="erosion">Erosion</option>}
                  </select>
                </label>
              )}
              {hazardType === "flood" && floodResult && (
                <div className="edash-underline-tabs">
                  <button type="button" className={`edash-underline-tab ${floodEngine === "river" && !show3D ? "is-active" : ""}`} onClick={() => { setFloodEngine("river"); setShow3D(false); }}>River</button>
                  <button type="button" className={`edash-underline-tab ${floodEngine === "floodplain" && !show3D ? "is-active" : ""}`} onClick={() => { setFloodEngine("floodplain"); setShow3D(false); }}>Floodplain</button>
                  <button type="button" className={`edash-underline-tab ${floodEngine === "rainfall" && !show3D ? "is-active" : ""}`} onClick={() => { setFloodEngine("rainfall"); setShow3D(false); }}>Rainfall</button>
                  <button type="button" className={`edash-underline-tab ${show3D ? "is-active" : ""}`} onClick={() => setShow3D((v) => !v)}>3D View</button>
                </div>
              )}
              {hazardType === "flood" && floodResult && show3D ? (
                <Suspense fallback={<p className="edash-tab-empty"><Spinner size={14} /> Loading 3D view...</p>}>
                  <HazardFlood3DView
                    key={floodEngine}
                    overlaySrc={displayOverlay}
                    interactive={displayInteractive}
                    engineLabel={floodEngine === "rainfall" ? "Rainfall susceptibility" : floodEngine === "floodplain" ? "Floodplain susceptibility" : "River flood"}
                    riskClass={activeFloodEngine?.risk_class}
                    waterDepthM={flood3DWater.depthM}
                    waterDepthModelled={flood3DWater.modelled}
                    waterDataAvailable={flood3DWater.dataAvailable}
                  />
                </Suspense>
              ) : displayOverlay ? (
                <HazardInteractiveOverlay src={displayOverlay} alt={`${hazardType} risk overlay`} interactive={displayInteractive} />
              ) : (
                <p className="edash-tab-empty">
                  {hazardType === "flood" && floodEngine === "river" ? "No modelled GloFAS coverage - no river-flood map to show for this location." : "No overlay available for this result."}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </EstateShell>
  );
}
