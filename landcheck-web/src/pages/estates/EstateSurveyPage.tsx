import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";

export default function EstateSurveyPage() {
  const { estateId } = useParams();
  const [estateName, setEstateName] = useState("");
  const [requests, setRequests] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get("/estates/survey-requests").then((response) => setRequests((response.data || []).filter((item: any) => item.estate.id === Number(estateId)))).catch(() => setRequests([]));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    try { await action(); setMessage(`${label} completed.`); load(); }
    catch (error) { setMessage(await extractApiErrorMessage(error, `${label} could not be completed.`)); }
  };

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="survey" recentActivity={activity}>
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Survey requests ({requests.length})</h3></div>
          {message && <p className="edash-tab-empty" style={{ padding: "4px 0" }}>{message}</p>}
          {requests.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {requests.map((item) => (
                <div key={item.id} className="edash-info-card" style={{ margin: 0 }}>
                  <span className="edash-info-card-icon"><EstateIcon name="survey" /></span>
                  <div className="edash-info-card-body">
                    <div className="edash-info-card-head">
                      <span className="edash-status-row-title">{item.plot.number}</span>
                      <span className="edash-status-pill tone-info">{item.status.replaceAll("_", " ")}</span>
                    </div>
                    <p className="edash-status-row-desc">{item.survey_reference ? `Reference ${item.survey_reference}` : "No reference assigned yet."}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {!item.materialized && <button type="button" className="edash-btn-primary" onClick={() => void run("Survey workspace", () => api.post(`/estates/survey-requests/${item.id}/start`))}>Start</button>}
                    {item.materialized && <Link className="edash-btn-outline" to={`/survey-plan?mode=survey&estate_survey_plot=${item.survey_working_plot_id || ""}`}>Open in Survey</Link>}
                    {item.materialized && item.status !== "completed" && <button type="button" className="edash-btn-primary" onClick={() => void run("Survey completion", () => api.post(`/estates/survey-requests/${item.id}/complete`))}>Complete</button>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="edash-tab-empty">No Survey requests yet. Prepare one from an allocated plot's drawer on the Map &amp; Plots page.</p>}
        </div>
      </div>
    </EstateShell>
  );
}
