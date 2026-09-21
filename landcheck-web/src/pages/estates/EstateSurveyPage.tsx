import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import { claimEstateSurveyRequestSession } from "../../auth/surveyAuth";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import EstatePagination from "../../components/estates/EstatePagination";
import { clearSurveyPlanDraft } from "../../offline/surveyPlanDraft";

export default function EstateSurveyPage() {
  const { estateId } = useParams();
  const navigate = useNavigate();
  const [estateName, setEstateName] = useState("");
  const [requests, setRequests] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [actionBusy, setActionBusy] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => setEstateName(response.data.name)).catch(() => undefined);
    api.get("/estates/survey-requests", { params: { estate_id: estateId, page, page_size: 20 } }).then((response) => { setRequests(response.data?.items || []); setTotal(Number(response.data?.total || 0)); }).catch(() => { setRequests([]); setTotal(0); });
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
  };
  useEffect(load, [estateId, page]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    if (actionBusy) return;
    setActionBusy(label);
    try { await action(); toast.success(`${label} completed.`); load(); }
    catch (error) { toast.error(await extractApiErrorMessage(error, `${label} could not be completed.`)); }
    finally { setActionBusy(""); }
  };

  const openInSurvey = async (surveyRequestId: number, surveyWorkingPlotId: number | string | null | undefined) => {
    try {
      await claimEstateSurveyRequestSession(surveyRequestId);
      // Estate handoffs are intentional fresh starts: do not reopen another plot's local preview.
      await clearSurveyPlanDraft();
      navigate(`/survey-plan?mode=survey&fresh=1&estate_survey_plot=${surveyWorkingPlotId || ""}`);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Could not open this plot in Survey."));
    }
  };

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} estateName={estateName} activeKey="survey" recentActivity={activity}>
      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head"><h3 className="edash-card-title">Survey requests ({requests.length})</h3></div>
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
                    {!item.materialized && <button type="button" className="edash-btn-primary" disabled={Boolean(actionBusy)} onClick={() => void run("Survey workspace", () => api.post(`/estates/survey-requests/${item.id}/start`))}>{actionBusy === "Survey workspace" ? "Starting..." : "Start"}</button>}
                    {item.materialized && <button type="button" className="edash-btn-outline" disabled={Boolean(actionBusy)} onClick={() => void openInSurvey(item.id, item.survey_working_plot_id)}>Open in Survey</button>}
                    {item.materialized && item.status !== "completed" && <button type="button" className="edash-btn-primary" disabled={Boolean(actionBusy)} onClick={() => void run("Survey completion", () => api.post(`/estates/survey-requests/${item.id}/complete`))}>{actionBusy === "Survey completion" ? "Completing..." : "Complete"}</button>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="edash-tab-empty">No Survey requests yet. Prepare one from an allocated plot's drawer on the Map &amp; Plots page.</p>}
          <EstatePagination page={page} pageSize={20} total={total} onChange={setPage} />
        </div>
      </div>
    </EstateShell>
  );
}
