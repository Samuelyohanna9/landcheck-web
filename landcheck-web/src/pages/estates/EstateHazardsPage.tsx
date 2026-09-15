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
              <div className="edash-risk-list" style={{ marginBottom: 16 }}>
                {Object.entries(dashboard.summary || {}).map(([type, value]: [string, any]) => {
                  const classes = Object.keys(value.classes || {});
                  const worst = classes.find((entry) => riskTone(entry) === "danger") || classes.find((entry) => riskTone(entry) === "warn") || classes[0];
                  return (
                    <div key={type} className="edash-risk-item">
                      <span className="edash-risk-icon"><EstateIcon name={type === "flood" ? "flood" : "erosion"} /></span>
                      <span style={{ textTransform: "capitalize" }}>{type} &middot; {value.assessed} assessed</span>
                      <span className={`edash-status-pill tone-${worst ? riskTone(worst) : "neutral"}`}>{worst ? worst.replaceAll("_", " ") : "Unscreened"}</span>
                    </div>
                  );
                })}
              </div>
              <div className="edash-card-head"><h3 className="edash-card-title">Per-plot results</h3></div>
              {(dashboard.assessments || []).length ? (
                <table className="edash-mini-table">
                  <thead><tr><th>Plot</th><th>Flood</th><th>Erosion</th></tr></thead>
                  <tbody>
                    {dashboard.assessments.map((item: any) => (
                      <tr key={item.plot_id || "estate"}>
                        <td data-label="Plot">{item.plot_id ? `Plot ${item.plot_id}` : "Estate"}</td>
                        <td data-label="Flood"><span className={`edash-status-pill tone-${riskTone(item.hazards?.flood?.risk_class)}`}>{item.hazards?.flood?.risk_class || "unavailable"}</span></td>
                        <td data-label="Erosion"><span className={`edash-status-pill tone-${riskTone(item.hazards?.erosion?.risk_class)}`}>{item.hazards?.erosion?.risk_class || "unavailable"}</span></td>
                      </tr>
                    ))}
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
