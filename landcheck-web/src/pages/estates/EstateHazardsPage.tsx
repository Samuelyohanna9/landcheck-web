import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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

function riskTone(riskClass: string | undefined) {
  const value = (riskClass || "").toLowerCase();
  if (["low", "minimal", "none"].includes(value)) return "good";
  if (["moderate", "medium"].includes(value)) return "warn";
  if (["high", "severe", "critical"].includes(value)) return "danger";
  return "neutral";
}

// The backend deliberately keeps River (a direct GloFAS river-flood model hit) and Floodplain (an
// elevation-relative-to-drainage screening proxy, used as a fallback where there's no direct river
// model coverage) as two independent signals rather than blending them into one score - a
// combined figure was found to actively destroy specificity (see hazards.py's
// _compute_flood_branches). Showing one bare "Flood: Severe" pill throws that nuance away and
// reads scarier than the evidence actually supports, so both signals get their own column here,
// matching how the full PDF report already presents them.
function floodSignalSummary(assessments: any[]) {
  const river = { assessed: 0, classes: {} as Record<string, number> };
  const floodplain = { assessed: 0, classes: {} as Record<string, number> };
  for (const item of assessments || []) {
    const summary = item.hazards?.flood?.result?.summary;
    if (!summary) continue;
    const riverClass = summary.river_available === false ? "No Data" : (summary.river_class || "unavailable");
    river.assessed += 1;
    river.classes[riverClass] = (river.classes[riverClass] || 0) + 1;
    const floodplainClass = summary.floodplain_class || "unavailable";
    floodplain.assessed += 1;
    floodplain.classes[floodplainClass] = (floodplain.classes[floodplainClass] || 0) + 1;
  }
  return { river, floodplain };
}

export default function EstateHazardsPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [dashboard, setDashboard] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [runBusy, setRunBusy] = useState(false);
  const [jobProgress, setJobProgress] = useState<{ pct: number; stage: string } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get(`/estates/${estateId}/hazards`).then((response) => setDashboard(response.data)).catch(() => setDashboard(null));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  }, [estateId]);

  // The whole-layout run screens every approved plot in the background (see hazards.py's async
  // job pattern) rather than blocking one request for the whole estate's runtime, so this polls
  // for status/progress instead of expecting the POST itself to return the finished result.
  const pollHazardJob = useCallback(async (jobId: string): Promise<HazardJobStatus> => {
    const startedAt = Date.now();
    const timeoutMs = 5 * 60 * 1000;
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
    setMessage("");
    setJobProgress({ pct: 0, stage: "Queued..." });
    try {
      const created = await api.post<HazardJobStatus>(`/estates/${estateId}/hazards/assess-all`);
      const job = await pollHazardJob(created.data.id);
      setDashboard(job.result);
      setMessage("Hazard analysis complete for the whole layout.");
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "Hazard analysis could not be run."));
    } finally {
      setRunBusy(false);
      setJobProgress(null);
    }
  };

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="hazard" recentActivity={activity}>
      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Whole-layout hazard analysis</h3>
          </div>
          <p className="edash-status-row-desc" style={{ marginBottom: 12 }}>
            Runs flood and erosion screening for every approved plot in this Estate in one pass, instead of one plot at a time. Results below - and the Risk Overview on the Dashboard - update as soon as it finishes.
          </p>
          <button type="button" className="edash-btn-primary" disabled={runBusy} onClick={() => void runEstateHazardAnalysis()}>
            {runBusy ? <><Spinner size={13} /> {jobProgress?.stage || "Analyzing layout..."}</> : "Run hazard analysis for entire layout"}
          </button>
          {message && <p className="edash-tab-empty" style={{ padding: "10px 0 0" }}>{message}</p>}
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
                  const { river, floodplain } = floodSignalSummary(dashboard.assessments || []);
                  const rows: Array<{ key: string; label: string; value: { assessed: number; classes: Record<string, number> } }> = [
                    { key: "river", label: "River (modelled)", value: river },
                    { key: "floodplain", label: "Floodplain (elevation)", value: floodplain },
                  ];
                  if (dashboard.summary?.erosion) rows.push({ key: "erosion", label: "Erosion", value: dashboard.summary.erosion });
                  return rows.map(({ key, label, value }) => {
                    const classes = Object.keys(value.classes || {});
                    const worst = classes.find((entry) => riskTone(entry) === "danger") || classes.find((entry) => riskTone(entry) === "warn") || classes[0];
                    return (
                      <div key={key} className="edash-risk-item">
                        <span className="edash-risk-icon"><EstateIcon name={key === "erosion" ? "erosion" : "flood"} /></span>
                        <span>{label} &middot; {value.assessed} assessed</span>
                        <span className={`edash-status-pill tone-${worst ? riskTone(worst) : "neutral"}`}>{worst ? worst.replaceAll("_", " ") : "Unscreened"}</span>
                      </div>
                    );
                  });
                })()}
              </div>
              <p className="edash-field-note" style={{ marginBottom: 16 }}>
                River reflects a direct modelled river-flood hit (JRC/Copernicus GloFAS). Floodplain reflects the site's elevation relative to the surrounding drainage network - a screening-level proxy used mainly where there's no direct river-model coverage, not a confirmed flood-zone determination. Open a plot's Hazard tab for the full method and confidence notes.
              </p>
              <div className="edash-card-head"><h3 className="edash-card-title">Per-plot results</h3></div>
              {(dashboard.assessments || []).length ? (
                <table className="edash-mini-table">
                  <thead><tr><th>Plot</th><th>River</th><th>Floodplain</th><th>Erosion</th></tr></thead>
                  <tbody>
                    {dashboard.assessments.map((item: any) => {
                      const floodSummary = item.hazards?.flood?.result?.summary;
                      const riverClass = floodSummary ? (floodSummary.river_available === false ? "No Data" : (floodSummary.river_class || "unavailable")) : (item.hazards?.flood ? "unavailable" : undefined);
                      const floodplainClass = floodSummary?.floodplain_class || (item.hazards?.flood ? item.hazards.flood.risk_class : undefined);
                      return (
                        <tr key={item.plot_id || "estate"}>
                          <td data-label="Plot">{item.plot_id ? `Plot ${item.plot_id}` : "Estate"}</td>
                          <td data-label="River"><span className={`edash-status-pill tone-${riskTone(riverClass)}`}>{riverClass || "unavailable"}</span></td>
                          <td data-label="Floodplain"><span className={`edash-status-pill tone-${riskTone(floodplainClass)}`}>{floodplainClass || "unavailable"}</span></td>
                          <td data-label="Erosion"><span className={`edash-status-pill tone-${riskTone(item.hazards?.erosion?.risk_class)}`}>{item.hazards?.erosion?.risk_class || "unavailable"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <p className="edash-tab-empty">No per-plot screening recorded yet.</p>}
            </>
          ) : (
            <p className="edash-tab-empty">No hazard screening recorded yet. Run flood and erosion screening from a plot's drawer on the Map &amp; Plots page.</p>
          )}
        </div>
      </div>
    </EstateShell>
  );
}
