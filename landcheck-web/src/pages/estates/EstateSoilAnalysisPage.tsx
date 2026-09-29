import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import Spinner from "../../components/estates/EstateSpinner";

// Soil Analysis is a standalone Estate-dashboard tool, deliberately separate from Hazard Analysis
// (see landcheck-api/app/utils/soil_analysis.py's module docstring for the full reasoning): it
// gives an indicative drainage/waterlogging reading, a presumptive bearing-capacity RANGE (from
// soil texture, BS 8004:1986), and a water-table-depth TENDENCY (from terrain wetness), all from
// satellite/terrain data - real, published screening techniques, never a substitute for an actual
// geotechnical investigation.

type SoilJobStatus = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string | null;
  progress_pct: number | null;
  error_text: string | null;
  result: any;
};

function isUpgradeRequiredError(err: any): boolean {
  return err?.response?.status === 402 && err?.response?.data?.detail?.code === "upgrade_required";
}

function riskTone(riskClass: string | undefined) {
  const value = (riskClass || "").toLowerCase();
  if (["low", "minimal", "none"].includes(value)) return "good";
  if (["moderate", "medium"].includes(value)) return "warn";
  if (["high", "severe", "critical"].includes(value)) return "danger";
  return "neutral";
}

function bearingCapacityText(bc: any): string {
  if (!bc || bc.min_kpa == null || bc.max_kpa == null) return "unavailable";
  return `${bc.min_kpa}–${bc.max_kpa} kPa`;
}

function waterTableText(wt: any): string {
  if (!wt || !wt.tendency || wt.tendency === "unavailable") return "unavailable";
  return wt.tendency.charAt(0).toUpperCase() + wt.tendency.slice(1);
}

export default function EstateSoilAnalysisPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [dashboard, setDashboard] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [runBusy, setRunBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [jobProgress, setJobProgress] = useState<{ pct: number; stage: string } | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get(`/estates/${estateId}/soil-analysis`).then((response) => { setDashboard(response.data); setUpgradeRequired(false); }).catch((err) => { setDashboard(null); setUpgradeRequired(isUpgradeRequiredError(err)); });
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  }, [estateId]);

  const pollSoilJob = useCallback(async (jobId: string): Promise<SoilJobStatus> => {
    const startedAt = Date.now();
    const timeoutMs = 10 * 60 * 1000;
    const pollIntervalMs = 1200;
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs));
      const res = await api.get<SoilJobStatus>(`/hazards/jobs/${jobId}`);
      const data = res.data;
      setJobProgress({ pct: data.progress_pct ?? 0, stage: data.stage || "" });
      if (data.status === "completed") return data;
      if (data.status === "failed") throw new Error(data.error_text || "Analysis failed");
    }
    throw new Error("Analysis is taking longer than expected. Please try again.");
  }, []);

  const runEstateSoilAnalysis = async () => {
    if (!estateId) return;
    setRunBusy(true);
    setJobProgress({ pct: 0, stage: "Queued..." });
    try {
      const created = await api.post<SoilJobStatus>(`/estates/${estateId}/soil-analysis/assess-all`);
      const job = await pollSoilJob(created.data.id);
      setDashboard(job.result);
      toast.success("Soil analysis complete for the Estate boundary.");
    } catch (error) {
      if (isUpgradeRequiredError(error)) setUpgradeRequired(true);
      else toast.error(await extractApiErrorMessage(error, "Soil analysis could not be run."));
    } finally {
      setRunBusy(false);
      setJobProgress(null);
    }
  };

  // The honest follow-through on the scope note below: Soil Analysis can't determine soil
  // density/consistency or subsurface layers, so this raises a real lead LandCheck's team can use
  // to connect the customer with a licensed geotechnical investigation - it doesn't book one.
  const requestGeotechSurvey = async () => {
    if (!estateId) return;
    setRequestBusy(true);
    try {
      await api.post(`/estates/${estateId}/soil-analysis/geotech-request`);
      toast.success("Request sent - LandCheck will follow up to arrange a geotechnical survey.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Request could not be sent."));
    } finally {
      setRequestBusy(false);
    }
  };

  if (!estateId) return null;

  if (upgradeRequired) {
    return (
      <EstateShell estateId={estateId} estateName={estateName} activeKey="soil" recentActivity={activity}>
        <div className="edash-card">
          <div className="edash-card-inner" style={{ textAlign: "center", padding: "48px 24px" }}>
            <span className="edash-risk-icon" style={{ margin: "0 auto 14px", width: 44, height: 44 }}><EstateIcon name="layers" /></span>
            <h3 className="edash-card-title" style={{ fontSize: "1.1rem", marginBottom: 8 }}>Soil analysis is a Plus plan feature</h3>
            <p className="edash-status-row-desc" style={{ maxWidth: 440, margin: "0 auto 18px" }}>
              Indicative drainage, bearing-capacity and water-table screening is available on the Plus plan.
            </p>
            <Link className="edash-btn-primary" style={{ display: "inline-flex" }} to="/estates/billing">Upgrade to Plus</Link>
          </div>
        </div>
      </EstateShell>
    );
  }

  const estateEntry = (dashboard?.assessments || []).find((item: any) => item.plot_id === null);
  const soilResult = estateEntry?.result;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="soil" recentActivity={activity}>
      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Soil Analysis</h3>
          </div>
          <p className="edash-status-row-desc" style={{ marginBottom: 12 }}>
            Uses satellite soil-texture and terrain data to give an indicative drainage/waterlogging reading, a presumptive bearing-capacity range, and a water-table-depth tendency for the Estate boundary. For a single plot, run it from its drawer's Soil tab on Map &amp; Plots, or use the whole-boundary run below.
          </p>
          <button type="button" className="edash-btn-primary" disabled={runBusy} onClick={() => void runEstateSoilAnalysis()}>
            {runBusy ? <><Spinner size={13} /> {jobProgress?.stage || "Analyzing Estate..."}</> : "Run soil analysis for the Estate boundary"}
          </button>
        </div>
      </div>

      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Estate boundary reading</h3></div>
          {soilResult ? (
            <>
              <div className="edash-risk-list" style={{ marginBottom: 10 }}>
                <div className="edash-risk-item">
                  <span className="edash-risk-icon"><EstateIcon name="layers" /></span>
                  <span>Drainage / waterlogging</span>
                  <span className={`edash-status-pill tone-${riskTone(soilResult.risk_class)}`}>{soilResult.risk_class || "unavailable"}</span>
                </div>
                <div className="edash-risk-item">
                  <span className="edash-risk-icon"><EstateIcon name="layers" /></span>
                  <span>Presumptive bearing capacity</span>
                  <span className="edash-status-pill tone-neutral">{bearingCapacityText(soilResult.presumptive_bearing_capacity)}</span>
                </div>
                <div className="edash-risk-item">
                  <span className="edash-risk-icon"><EstateIcon name="layers" /></span>
                  <span>Water table tendency</span>
                  <span className="edash-status-pill tone-neutral">{waterTableText(soilResult.water_table)}</span>
                </div>
              </div>
              {soilResult.presumptive_bearing_capacity?.soil_description && (
                <p className="edash-field-note" style={{ marginBottom: 6 }}>
                  Soil description: {soilResult.presumptive_bearing_capacity.soil_description}. {soilResult.presumptive_bearing_capacity.note}
                </p>
              )}
              {soilResult.water_table?.note && (
                <p className="edash-field-note" style={{ marginBottom: 6 }}>{soilResult.water_table.note}</p>
              )}
              {Array.isArray(soilResult.soil_profile) && soilResult.soil_profile.length > 0 && (
                <>
                  <div className="edash-card-head" style={{ marginTop: 4 }}><h3 className="edash-card-title" style={{ fontSize: "0.95rem" }}>Indicative soil profile (0&ndash;2m)</h3></div>
                  <table className="edash-mini-table" style={{ marginBottom: 10 }}>
                    <thead><tr><th>Depth</th><th>Texture</th><th>Sand</th><th>Clay</th></tr></thead>
                    <tbody>
                      {soilResult.soil_profile.map((layer: any) => (
                        <tr key={layer.depth_cm}>
                          <td data-label="Depth">{layer.depth_cm} cm</td>
                          <td data-label="Texture">{layer.texture}</td>
                          <td data-label="Sand">{layer.sand_pct}%</td>
                          <td data-label="Clay">{layer.clay_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="edash-field-note" style={{ marginBottom: 10 }}>
                    A modelled texture reading at each depth (SoilGrids, ~250m resolution) - not a borehole log. It does not identify bedrock depth or distinct geological strata.
                  </p>
                </>
              )}
              <p className="edash-field-note" style={{ marginBottom: 16 }}>
                <strong>{soilResult.scope_note}</strong>
              </p>
              <button type="button" className="edash-btn-outline" disabled={requestBusy} onClick={() => void requestGeotechSurvey()}>
                {requestBusy ? <><Spinner size={13} /> Sending...</> : "Request a geotechnical survey"}
              </button>
            </>
          ) : (
            <p className="edash-tab-empty">No soil analysis recorded yet for the Estate boundary. Run it above.</p>
          )}
        </div>
      </div>

      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Per-plot results</h3></div>
          {(dashboard?.assessments || []).filter((item: any) => item.plot_id !== null).length ? (
            <table className="edash-mini-table">
              <thead><tr><th>Plot</th><th>Drainage</th><th>Bearing capacity</th><th>Water table</th></tr></thead>
              <tbody>
                {dashboard.assessments.filter((item: any) => item.plot_id !== null).map((item: any) => (
                  <tr key={item.plot_id}>
                    <td data-label="Plot">Plot {item.plot_id}</td>
                    <td data-label="Drainage"><span className={`edash-status-pill tone-${riskTone(item.risk_class)}`}>{item.risk_class || "unavailable"}</span></td>
                    <td data-label="Bearing capacity"><span className="edash-status-pill tone-neutral">{bearingCapacityText(item.result?.presumptive_bearing_capacity)}</span></td>
                    <td data-label="Water table"><span className="edash-status-pill tone-neutral">{waterTableText(item.result?.water_table)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="edash-tab-empty">No per-plot soil analysis recorded yet. Run it from a plot's drawer on Map &amp; Plots.</p>}
        </div>
      </div>
    </EstateShell>
  );
}
