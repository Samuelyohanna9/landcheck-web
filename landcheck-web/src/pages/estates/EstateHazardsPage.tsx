import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import Spinner from "../../components/estates/EstateSpinner";

type HazardJobStatus = {
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

// The backend keeps River (a direct GloFAS river-flood model hit), Floodplain (an elevation-
// relative-to-drainage screening proxy, used as a fallback where there's no direct river model
// coverage) and Rainfall (experimental - a same-city matched-pair test found it could not reliably
// tell a documented flood zone from a well-drained one, AUC 0.361) as three independent signals
// rather than blending them into one score - a combined figure was found to actively destroy
// specificity (see hazards.py's _compute_flood_branches). Each gets its own column/row rather than
// one bare "Flood" pill, and each shows its own 0-100 risk SCORE (not a calibrated probability of
// an actual flood - these are heuristic susceptibility scores) instead of a word like "Severe",
// which read scarier than a screening-level proxy's evidence actually supports.
function percentOf(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function floodSignalSummary(assessments: any[]) {
  const make = () => ({ assessed: 0, classes: {} as Record<string, number>, percents: [] as number[] });
  const river = make();
  const floodplain = make();
  const rainfall = make();
  for (const item of (assessments || []).some((entry: any) => !entry.plot_id) ? (assessments || []).filter((entry: any) => !entry.plot_id) : (assessments || [])) {
    const result = item.hazards?.flood?.result;
    const summary = result?.summary;
    if (!summary) continue;
    const riverAvailable = summary.river_available !== false;
    river.assessed += 1;
    river.classes[riverAvailable ? (summary.river_class || "unavailable") : "No Data"] = (river.classes[riverAvailable ? (summary.river_class || "unavailable") : "No Data"] || 0) + 1;
    if (riverAvailable) { const p = percentOf(result?.river?.risk_score); if (p !== null) river.percents.push(p); }

    floodplain.assessed += 1;
    const floodplainClass = summary.floodplain_class || "unavailable";
    floodplain.classes[floodplainClass] = (floodplain.classes[floodplainClass] || 0) + 1;
    const fp = percentOf(result?.floodplain?.risk_score);
    if (fp !== null) floodplain.percents.push(fp);

    if (result?.rainfall?.data_available !== false) {
      rainfall.assessed += 1;
      const rp = percentOf(result?.rainfall?.risk_score);
      if (rp !== null) rainfall.percents.push(rp);
    }
  }
  return { river, floodplain, rainfall };
}

export default function EstateHazardsPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [dashboard, setDashboard] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [runBusy, setRunBusy] = useState(false);
  const [jobProgress, setJobProgress] = useState<{ pct: number; stage: string } | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get(`/estates/${estateId}/hazards`).then((response) => { setDashboard(response.data); setUpgradeRequired(false); }).catch((err) => { setDashboard(null); setUpgradeRequired(isUpgradeRequiredError(err)); });
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  }, [estateId]);

  // The whole-layout run screens every approved plot in the background (see hazards.py's async
  // job pattern) rather than blocking one request for the whole estate's runtime, so this polls
  // for status/progress instead of expecting the POST itself to return the finished result.
  const pollHazardJob = useCallback(async (jobId: string): Promise<HazardJobStatus> => {
    const startedAt = Date.now();
    const timeoutMs = 10 * 60 * 1000;
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

  const runEstateHazardAnalysis = async () => {
    if (!estateId) return;
    setRunBusy(true);
    setJobProgress({ pct: 0, stage: "Queued..." });
    try {
      const created = await api.post<HazardJobStatus>(`/estates/${estateId}/hazards/assess-all`);
      const job = await pollHazardJob(created.data.id);
      setDashboard(job.result);
      toast.success("Hazard analysis complete for the Estate boundary.");
    } catch (error) {
      if (isUpgradeRequiredError(error)) setUpgradeRequired(true);
      else toast.error(await extractApiErrorMessage(error, "Hazard analysis could not be run."));
    } finally {
      setRunBusy(false);
      setJobProgress(null);
    }
  };

  if (!estateId) return null;

  if (upgradeRequired) {
    return (
      <EstateShell estateId={estateId} estateName={estateName} activeKey="hazard" recentActivity={activity}>
        <div className="edash-card">
          <div className="edash-card-inner" style={{ textAlign: "center", padding: "48px 24px" }}>
            <span className="edash-risk-icon" style={{ margin: "0 auto 14px", width: 44, height: 44 }}><EstateIcon name="flood" /></span>
            <h3 className="edash-card-title" style={{ fontSize: "1.1rem", marginBottom: 8 }}>Hazard analysis is a Plus plan feature</h3>
            <p className="edash-status-row-desc" style={{ maxWidth: 440, margin: "0 auto 18px" }}>
              Flood and erosion screening - including whole-layout analysis and the Risk Overview on your Dashboard - is available on the Plus plan.
            </p>
            <Link className="edash-btn-primary" style={{ display: "inline-flex" }} to="/estates/billing">Upgrade to Plus</Link>
          </div>
        </div>
      </EstateShell>
    );
  }

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="hazard" recentActivity={activity}>
      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Estate hazard analysis</h3>
          </div>
          <p className="edash-status-row-desc" style={{ marginBottom: 12 }}>
            Runs flood and erosion screening once for the Estate boundary. Results below - and the Risk Overview on the Dashboard - update as soon as it finishes. For a single plot, run screening from its drawer on Map & Plots.
          </p>
          <button type="button" className="edash-btn-primary" disabled={runBusy} onClick={() => void runEstateHazardAnalysis()}>
            {runBusy ? <><Spinner size={13} /> {jobProgress?.stage || "Analyzing Estate..."}</> : "Run hazard analysis for the Estate boundary"}
          </button>
        </div>
      </div>
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Site intelligence summary</h3></div>
          {dashboard ? (
            <>
              <p className="edash-status-row-desc" style={{ marginBottom: 10 }}>{dashboard.assessment_count || 0} assessment record(s) stored against this Estate.</p>
              <div className="edash-risk-list" style={{ marginBottom: 10 }}>
                {(() => {
                  const { river, floodplain, rainfall } = floodSignalSummary(dashboard.assessments || []);
                  const rows: Array<{ key: string; label: string; value: { assessed: number; classes: Record<string, number>; percents: number[] }; experimental?: boolean }> = [
                    { key: "river", label: "River (modelled)", value: river },
                    { key: "floodplain", label: "Floodplain (elevation)", value: floodplain },
                    { key: "rainfall", label: "Rainfall (experimental)", value: rainfall, experimental: true },
                  ];
                  if (dashboard.summary?.erosion) rows.push({ key: "erosion", label: "Erosion", value: { ...dashboard.summary.erosion, percents: [] } });
                  return rows.map(({ key, label, value, experimental }) => {
                    const classes = Object.keys(value.classes || {});
                    const worst = classes.find((entry) => riskTone(entry) === "danger") || classes.find((entry) => riskTone(entry) === "warn") || classes[0];
                    const maxPct = value.percents.length ? Math.max(...value.percents) : null;
                    const display = maxPct !== null ? `Up to ${maxPct}%` : (worst ? worst.replaceAll("_", " ") : (value.assessed ? "No data" : "Unscreened"));
                    return (
                      <div key={key} className="edash-risk-item">
                        <span className="edash-risk-icon"><EstateIcon name={key === "erosion" ? "erosion" : "flood"} /></span>
                        <span>{label} &middot; {value.assessed} assessed</span>
                        <span className={`edash-status-pill tone-${experimental ? "neutral" : (worst ? riskTone(worst) : "neutral")}`}>{display}</span>
                      </div>
                    );
                  });
                })()}
              </div>
              <p className="edash-field-note" style={{ marginBottom: 16 }}>
                Scores are 0-100 site-relative risk indicators, not calibrated probabilities of an actual flood - each signal is independent and shouldn't be summed or averaged together. River reflects a direct modelled river-flood hit (JRC/Copernicus GloFAS). Floodplain reflects elevation relative to the surrounding drainage network - a screening-level proxy used mainly where there's no direct river-model coverage. Rainfall is experimental: in testing it could not reliably tell a documented flood zone from a well-drained one, so it's shown for transparency only, never as confirmed risk evidence. Open a plot's Hazard tab for the full method and confidence notes.
              </p>
              <div className="edash-card-head"><h3 className="edash-card-title">Results</h3></div>
              {(dashboard.assessments || []).length ? (
                <table className="edash-mini-table">
                  <thead><tr><th>Plot</th><th>River</th><th>Floodplain</th><th>Rainfall (exp.)</th><th>Erosion</th></tr></thead>
                  <tbody>
                    {dashboard.assessments.map((item: any) => {
                      const floodResult = item.hazards?.flood?.result;
                      const floodSummary = floodResult?.summary;
                      const riverAvailable = floodSummary ? floodSummary.river_available !== false : false;
                      const riverClass = floodSummary ? (riverAvailable ? (floodSummary.river_class || "unavailable") : "No Data") : (item.hazards?.flood ? "unavailable" : undefined);
                      const riverPct = riverAvailable ? percentOf(floodResult?.river?.risk_score) : null;
                      const floodplainClass = floodSummary?.floodplain_class || (item.hazards?.flood ? item.hazards.flood.risk_class : undefined);
                      const floodplainPct = percentOf(floodResult?.floodplain?.risk_score);
                      const rainfallAvailable = floodResult?.rainfall?.data_available !== false;
                      const rainfallPct = rainfallAvailable ? percentOf(floodResult?.rainfall?.risk_score) : null;
                      return (
                        <tr key={item.plot_id || "estate"}>
                          <td data-label="Plot">{item.plot_id ? `Plot ${item.plot_id}` : "Estate"}</td>
                          <td data-label="River"><span className={`edash-status-pill tone-${riskTone(riverClass)}`}>{riverPct !== null ? `${riverPct}%` : (riverClass || "unavailable")}</span></td>
                          <td data-label="Floodplain"><span className={`edash-status-pill tone-${riskTone(floodplainClass)}`}>{floodplainPct !== null ? `${floodplainPct}%` : (floodplainClass || "unavailable")}</span></td>
                          <td data-label="Rainfall (exp.)"><span className="edash-status-pill tone-neutral">{rainfallPct !== null ? `${rainfallPct}%` : "unavailable"}</span></td>
                          <td data-label="Erosion"><span className={`edash-status-pill tone-${riskTone(item.hazards?.erosion?.risk_class)}`}>{item.hazards?.erosion?.risk_class || "unavailable"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <p className="edash-tab-empty">No screening recorded yet.</p>}
            </>
          ) : (
            <p className="edash-tab-empty">No hazard screening recorded yet. Run flood and erosion screening from a plot's drawer on the Map &amp; Plots page.</p>
          )}
        </div>
      </div>
    </EstateShell>
  );
}
