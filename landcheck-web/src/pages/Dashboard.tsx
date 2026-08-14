import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { clearSurveyAuthSession, getSurveyAuthSession } from "../auth/surveyAuth";
import "../styles/dashboard.css";
import { prefetchSurveyPlanPreviewStep, prefetchSurveyPlanRoute } from "../utils/surveyPlanPrefetch";

type MyPlot = {
  plot_id: number;
  created_at: string | null;
  title: string | null;
  location: string | null;
  scale: string | null;
  status: "draft" | "completed";
};

const QUICK_TOOLS: { mode: "survey" | "subdivision" | "georeference"; label: string }[] = [
  { mode: "survey", label: "Survey Plan" },
  { mode: "subdivision", label: "Subdivision" },
  { mode: "georeference", label: "Georeference Plan" },
];

const greetingForNow = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

export default function Dashboard() {
  const navigate = useNavigate();
  const session = getSurveyAuthSession();
  const [plots, setPlots] = useState<MyPlot[]>([]);
  const [loading, setLoading] = useState(true);

  const warmSurveyPlanEntry = () => {
    void prefetchSurveyPlanRoute();
    void prefetchSurveyPlanPreviewStep();
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get("/plots/mine")
      .then((res) => {
        if (active) setPlots(res.data?.plots || []);
      })
      .catch(() => {
        if (active) setPlots([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const displayName = (session?.user?.full_name || "").trim() || "Surveyor";

  const handleSignOut = () => {
    clearSurveyAuthSession();
    navigate("/survey");
  };

  return (
    <div className="dashboard-container workspace-container">
      <header className="dashboard-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate("/")}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <h1>{greetingForNow()}, {displayName}</h1>
        </div>
        <div className="header-right">
          <button
            className="new-plot-btn"
            onMouseEnter={warmSurveyPlanEntry}
            onFocus={warmSurveyPlanEntry}
            onTouchStart={warmSurveyPlanEntry}
            onClick={() => navigate("/survey-plan")}
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Survey Plan
          </button>
          <button className="workspace-signout-btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="plots-section">
        <h2>Recent Projects</h2>

        {loading ? (
          <div className="empty-state">
            <p>Loading your projects...</p>
          </div>
        ) : plots.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <h3>No projects yet</h3>
            <p>Create your first survey plan to see it here</p>
            <button
              onMouseEnter={warmSurveyPlanEntry}
              onFocus={warmSurveyPlanEntry}
              onTouchStart={warmSurveyPlanEntry}
              onClick={() => navigate("/survey-plan")}
            >
              Create Survey Plan
            </button>
          </div>
        ) : (
          <div className="workspace-project-list">
            {plots.map((plot) => (
              <div key={plot.plot_id} className="workspace-project-row">
                <div className="workspace-project-info">
                  <span className="workspace-project-title">{plot.title || `Untitled Plot #${plot.plot_id}`}</span>
                  {plot.location && <span className="workspace-project-location">{plot.location}</span>}
                </div>
                <span className={`workspace-status-pill workspace-status-${plot.status}`}>
                  {plot.status === "completed" ? "Completed" : "Draft"}
                </span>
                {plot.status === "completed" ? (
                  <a
                    href={`${api.defaults.baseURL}/plots/${plot.plot_id}/download/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="workspace-project-action"
                  >
                    Open
                  </a>
                ) : (
                  <button className="workspace-project-action" onClick={() => navigate("/survey-plan")}>
                    Continue
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="workspace-quick-tools-section">
        <h2>Quick Tools</h2>
        <div className="workspace-quick-tools">
          {QUICK_TOOLS.map((tool) => (
            <button
              key={tool.mode}
              className="workspace-quick-tool"
              onMouseEnter={warmSurveyPlanEntry}
              onFocus={warmSurveyPlanEntry}
              onClick={() => navigate(`/survey-plan?mode=${tool.mode}`)}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
