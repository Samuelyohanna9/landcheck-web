import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, BACKEND_URL } from "../api/client";
import { clearWorkAuthed, getWorkAuthSession } from "../auth/workAuth";
import { isProjectedCoordinateSystem } from "../utils/coordinateConverter";
import "../styles/admin-dashboard.css";

type Analytics = {
  total_plots: number;
  plots_today: number;
  plots_week: number;
  plots_month: number;
  total_features: number;
  features_by_type: Record<string, number>;
  generated_at: string;
};

type DailyData = {
  date: string;
  count: number;
};

type FeedbackSummary = {
  total_feedback: number;
  professions: Record<string, number>;
  avg_satisfaction: number;
  willing_to_pay: Record<string, number>;
};

type PlotDetail = {
  plot_id: number;
  created_at: string | null;
  title_text: string | null;
  location_text: string | null;
  lga_text: string | null;
  state_text: string | null;
  surveyor_name: string | null;
  surveyor_rank: string | null;
  scale_text: string | null;
  paper_size: string | null;
  coordinate_system: string | null;
  template_name: string | null;
  parent_plot_id: number | null;
  subdivision_batch_id: number | null;
  subdivision_lot_no: string | null;
  estate_name: string | null;
  workflow_type: "subdivision" | "survey_plan";
  geometry: { type: string; coordinates: number[][][] } | null;
  coords: number[][];
  detected_features: {
    inside: Record<string, number>;
    buffer: Record<string, number>;
  };
  reports_generated: Record<string, boolean>;
  meta_created_at: string | null;
  meta_updated_at: string | null;
  export_summary: {
    total_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    queued_jobs: number;
    running_jobs: number;
    last_export_type?: string | null;
    last_export_status?: string | null;
    last_export_at?: string | null;
    export_types: string[];
  };
};

type SurveyUserInputPoint = {
  station: string | null;
  x: number | null;
  y: number | null;
  height: number | null;
};

type SurveyUserPlot = {
  plot_id: number;
  title_text: string | null;
  location_text: string | null;
  template_name: string | null;
  created_at: string | null;
  coordinate_system: string | null;
  survey_input_coordinates: SurveyUserInputPoint[];
  parent_plot_id: number | null;
  estate_name: string | null;
  workflow_type: "subdivision" | "survey_plan";
};

type SurveyUser = {
  id: number;
  email: string;
  full_name: string | null;
  created_at: string | null;
  last_login_at: string | null;
  plot_count: number;
  plots: SurveyUserPlot[];
};

type OsmOverpassCountryUsage = {
  country_hint: string;
  total_calls: number;
  cache_hits: number;
  distinct_buckets: number;
  distinct_plots: number;
  first_seen: string | null;
  last_seen: string | null;
  avg_fetch_ms: number | null;
};

type OsmOverpassUsage = {
  by_country: OsmOverpassCountryUsage[];
  recent: unknown[];
};

type GeoreferenceSession = {
  id: string;
  title_text: string | null;
  status: string | null;
  target_coordinate_system: string | null;
  target_epsg: number | null;
  source_file_name: string | null;
  source_content_type: string | null;
  created_at: string | null;
  updated_at: string | null;
  finalized_at: string | null;
};

type SurveyActivityEvent = {
  id: number;
  event_type: string;
  workflow: string;
  plot_id: number | null;
  subdivision_batch_id: number | null;
  georeference_session_id: string | null;
  details: Record<string, unknown>;
  created_at: string | null;
  actor_email: string | null;
  actor_name: string | null;
  preview_only: boolean;
};

type FeedbackEntry = {
  id: number;
  profession: string;
  experience: string;
  useful_features: string;
  problems: string;
  feature_requests: string;
  willing_to_pay: string;
  satisfaction: number;
  email: string;
  created_at: string | null;
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [isAuthed, setIsAuthed] = useState(() => {
    const session = getWorkAuthSession();
    return Boolean(session && (session.auth_mode === "env_admin" || session.user?.role_key === "super_admin"));
  });
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [feedbackData, setFeedbackData] = useState<FeedbackSummary | null>(null);
  const [plotDetails, setPlotDetails] = useState<PlotDetail[]>([]);
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>([]);
  const [surveyUsers, setSurveyUsers] = useState<SurveyUser[]>([]);
  const [expandedSurveyUserId, setExpandedSurveyUserId] = useState<number | null>(null);
  const [georeferenceSessions, setGeoreferenceSessions] = useState<GeoreferenceSession[]>([]);
  const [surveyActivity, setSurveyActivity] = useState<SurveyActivityEvent[]>([]);
  const [osmOverpassUsage, setOsmOverpassUsage] = useState<OsmOverpassCountryUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getWorkAuthSession();
    if (!session || (session.auth_mode !== "env_admin" && session.user?.role_key !== "super_admin")) {
      setIsAuthed(false);
      setLoading(false);
      return;
    }
    if (!isAuthed) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const results = await Promise.allSettled([
          api.get("/analytics/overview"),
          api.get("/analytics/plots/daily?days=14"),
          api.get("/analytics/feedback"),
          api.get("/analytics/plots/details"),
          api.get("/feedback"),
          api.get("/analytics/survey-users"),
          api.get("/analytics/georeference-sessions"),
          api.get("/analytics/survey-activity"),
          api.get("/analytics/osm-overpass-usage"),
        ]);

        const [analyticsRes, dailyRes, feedbackRes, plotsRes, feedbackListRes, surveyUsersRes, georefSessionsRes, surveyActivityRes, osmOverpassRes] = results;

        if (analyticsRes.status === "fulfilled") {
          setAnalytics(analyticsRes.value.data);
        }
        if (dailyRes.status === "fulfilled") {
          setDailyData(dailyRes.value.data);
        }
        if (feedbackRes.status === "fulfilled") {
          setFeedbackData(feedbackRes.value.data);
        }
        if (plotsRes.status === "fulfilled") {
          const data = plotsRes.value.data;
          setPlotDetails(Array.isArray(data) ? data : []);
        }
        if (feedbackListRes.status === "fulfilled") {
          const data = feedbackListRes.value.data;
          setFeedbackEntries(Array.isArray(data) ? data : []);
        }
        if (surveyUsersRes.status === "fulfilled") {
          const data = surveyUsersRes.value.data;
          setSurveyUsers(Array.isArray(data) ? data : []);
        }
        if (georefSessionsRes.status === "fulfilled") {
          const data = georefSessionsRes.value.data;
          setGeoreferenceSessions(Array.isArray(data) ? data : []);
        }
        if (surveyActivityRes.status === "fulfilled") {
          const data = surveyActivityRes.value.data;
          setSurveyActivity(Array.isArray(data) ? data : []);
        }
        if (osmOverpassRes.status === "fulfilled") {
          const data = osmOverpassRes.value.data as OsmOverpassUsage | undefined;
          setOsmOverpassUsage(Array.isArray(data?.by_country) ? data!.by_country : []);
        }
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isAuthed]);

  const handleLogout = () => {
    clearWorkAuthed();
    setIsAuthed(false);
    setAnalytics(null);
    setDailyData([]);
    setFeedbackData(null);
    setPlotDetails([]);
    setFeedbackEntries([]);
    setSurveyUsers([]);
    setGeoreferenceSessions([]);
    setSurveyActivity([]);
    setOsmOverpassUsage([]);
    setLoading(false);
  };

  const maxCount = Math.max(...dailyData.map((d) => d.count), 1);

  const formatDateTime = (value?: string | null) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatSurveyActivity = (event: SurveyActivityEvent) => {
    const labels: Record<string, string> = {
      preview_completed: "Preview completed",
      raster_uploaded: "Raster uploaded",
      georeference_solved: "Georeference solved",
      digitizing_saved: "Digitizing saved",
      export_downloaded: "Export downloaded",
    };
    return labels[event.event_type] || event.event_type.replace(/_/g, " ");
  };

  const renderFeatureSummary = (plot: PlotDetail) => {
    const inside = plot.detected_features?.inside || {};
    const buffer = plot.detected_features?.buffer || {};
    const types = ["building", "road", "river"];

    return (
      <div className="feature-summary">
        {types.map((type) => {
          const count = (inside[type] || 0) + (buffer[type] || 0);
          return (
            <div key={type} className="feature-chip">
              <span className="feature-type">{type}</span>
              <span className="feature-count">{count}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const reportLabels: Record<string, string> = {
    survey_plan_pdf: "Survey Plan PDF",
    survey_plan_preview: "Survey Plan Preview",
    orthophoto_pdf: "Orthophoto PDF",
    orthophoto_preview: "Orthophoto Preview",
    topo_map_pdf: "Topo Map PDF",
    topo_map_preview: "Topo Map Preview",
    dwg: "DWG/DXF",
    back_computation_pdf: "Back Computation PDF",
  };

  const formatTemplateName = (value?: string | null) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "General";
    const map: Record<string, string> = {
      general: "General",
      adamawa_osg: "Adamawa OSG",
      akwa_ibom_osg: "Akwa Ibom OSG",
      rivers_osg: "Rivers OSG",
      cross_river_osg: "Cross River OSG",
      fct_abuja_osg: "FCT Abuja OSG",
    };
    return map[normalized] || normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const formatCoordinateSystem = (value?: string | null) => {
    const normalized = String(value || "").trim();
    if (!normalized) return "WGS84";
    const labelMap: Record<string, string> = {
      wgs84: "WGS84",
      "WGS84 (Lat/Lon)": "WGS84 (Lat/Lon)",
      utm_31n: "UTM Zone 31N",
      utm_32n: "UTM Zone 32N",
      utm_33n: "UTM Zone 33N",
      minna_31: "Minna Zone 31",
      minna_32: "Minna Zone 32",
      minna_33: "Minna Zone 33",
    };
    return labelMap[normalized] || normalized;
  };

  const formatExportType = (value?: string | null) => {
    if (!value) return "None";
    const cleaned = String(value).trim().toLowerCase();
    const map: Record<string, string> = {
      "survey-plan.pdf": "Survey Plan PDF",
      "orthophoto.pdf": "Orthophoto PDF",
      "topomap.pdf": "Topo Map PDF",
      "survey-plan.dxf": "DXF Export",
      "survey-plan.shapefile": "Shapefile Export",
      "back-computation.pdf": "Back Computation PDF",
      "technical-report.docx": "Technical Report DOCX",
      "subdivision-clean-copy.pdf": "Subdivision Clean Copy PDF",
    };
    return map[cleaned] || cleaned.replace(/[-.]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const formatStatus = (value?: string | null) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "Unknown";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const userMonitoring = plotDetails.reduce<
    Array<{
      key: string;
      surveyorName: string;
      surveyorRank: string;
      plotsCount: number;
      templates: string[];
      paperSizes: string[];
      coordinateSystems: string[];
      firstActivity: string | null;
      lastActivity: string | null;
      totalExportJobs: number;
      completedExportJobs: number;
      failedExportJobs: number;
      lastExportType: string | null;
      latestPlotId: number | null;
    }>
  >((acc, plot) => {
    const surveyorName = String(plot.surveyor_name || "").trim() || "Unknown surveyor";
    const surveyorRank = String(plot.surveyor_rank || "").trim() || "Unspecified";
    const key = `${surveyorName}::${surveyorRank}`;
    let item = acc.find((entry) => entry.key === key);
    if (!item) {
      item = {
        key,
        surveyorName,
        surveyorRank,
        plotsCount: 0,
        templates: [],
        paperSizes: [],
        coordinateSystems: [],
        firstActivity: null,
        lastActivity: null,
        totalExportJobs: 0,
        completedExportJobs: 0,
        failedExportJobs: 0,
        lastExportType: null,
        latestPlotId: null,
      };
      acc.push(item);
    }

    item.plotsCount += 1;
    const templateLabel = formatTemplateName(plot.template_name);
    if (templateLabel && !item.templates.includes(templateLabel)) item.templates.push(templateLabel);
    const paperLabel = String(plot.paper_size || "").trim() || "A4";
    if (!item.paperSizes.includes(paperLabel)) item.paperSizes.push(paperLabel);
    const coordLabel = formatCoordinateSystem(plot.coordinate_system);
    if (coordLabel && !item.coordinateSystems.includes(coordLabel)) item.coordinateSystems.push(coordLabel);

    const activityCandidates = [
      plot.created_at,
      plot.meta_created_at,
      plot.meta_updated_at,
      plot.export_summary?.last_export_at || null,
    ].filter(Boolean) as string[];

    const firstActivity = activityCandidates.length > 0
      ? activityCandidates.reduce((lowest, current) =>
          new Date(current).getTime() < new Date(lowest).getTime() ? current : lowest
        )
      : null;
    const lastActivity = activityCandidates.length > 0
      ? activityCandidates.reduce((highest, current) =>
          new Date(current).getTime() > new Date(highest).getTime() ? current : highest
        )
      : null;

    if (firstActivity && (!item.firstActivity || new Date(firstActivity).getTime() < new Date(item.firstActivity).getTime())) {
      item.firstActivity = firstActivity;
    }
    if (lastActivity && (!item.lastActivity || new Date(lastActivity).getTime() > new Date(item.lastActivity).getTime())) {
      item.lastActivity = lastActivity;
      item.latestPlotId = plot.plot_id;
      item.lastExportType = plot.export_summary?.last_export_type || item.lastExportType;
    }

    item.totalExportJobs += Number(plot.export_summary?.total_jobs || 0);
    item.completedExportJobs += Number(plot.export_summary?.completed_jobs || 0);
    item.failedExportJobs += Number(plot.export_summary?.failed_jobs || 0);
    return acc;
  }, []).sort((a, b) => {
    const aTime = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
    const bTime = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
    return bTime - aTime;
  });

  const templateUsage = plotDetails.reduce<Record<string, number>>((acc, plot) => {
    const key = formatTemplateName(plot.template_name);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const templateUsageRows = Object.entries(templateUsage)
    .sort((a, b) => b[1] - a[1])
    .map(([template, count]) => ({ template, count }));

  const exportTotals = plotDetails.reduce(
    (acc, plot) => {
      acc.total += Number(plot.export_summary?.total_jobs || 0);
      acc.completed += Number(plot.export_summary?.completed_jobs || 0);
      acc.failed += Number(plot.export_summary?.failed_jobs || 0);
      acc.running += Number(plot.export_summary?.running_jobs || 0);
      acc.queued += Number(plot.export_summary?.queued_jobs || 0);
      return acc;
    },
    { total: 0, completed: 0, failed: 0, running: 0, queued: 0 }
  );

  const reportLinks = (plotId: number) => ({
    survey_plan_pdf: `${BACKEND_URL}/plots/${plotId}/reports/survey-plan?refresh=1`,
    orthophoto_pdf: `${BACKEND_URL}/plots/${plotId}/reports/orthophoto?map_type=satellite&refresh=1`,
    topo_map_pdf: `${BACKEND_URL}/plots/${plotId}/reports/orthophoto?map_type=topo&refresh=1`,
    dwg: `${BACKEND_URL}/plots/${plotId}/survey-plan/dwg`,
    back_computation_pdf: `${BACKEND_URL}/plots/${plotId}/reports/back-computation?refresh=1`,
  });

  if (!isAuthed) {
    return (
      <div className="admin-login">
        <div className="admin-login-card">
          <h1>Authorized Work Session Required</h1>
          <p>Sign in through LandCheck Work with a Super Admin account to access this dashboard.</p>
          <button type="button" onClick={() => navigate("/green-work/login")}>Open LandCheck Work Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      {/* Header */}
      <header className="admin-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate("/")}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <h1>Admin Dashboard</h1>
        </div>
        <div className="header-right">
          <span className="last-updated">
            {analytics?.generated_at && `Updated: ${new Date(analytics.generated_at).toLocaleString()}`}
          </span>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading analytics...</p>
        </div>
      ) : (
        <div className="admin-content">
          {/* Main Stats */}
          <section className="stats-section">
            <h2>Plot Statistics</h2>
            <div className="stats-grid">
              <div className="stat-card primary">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{analytics?.total_plots || 0}</span>
                  <span className="stat-label">Total Plots</span>
                </div>
              </div>

              <div className="stat-card success">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{analytics?.plots_today || 0}</span>
                  <span className="stat-label">Today</span>
                </div>
              </div>

              <div className="stat-card info">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{analytics?.plots_week || 0}</span>
                  <span className="stat-label">This Week</span>
                </div>
              </div>

              <div className="stat-card warning">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{analytics?.plots_month || 0}</span>
                  <span className="stat-label">This Month</span>
                </div>
              </div>
            </div>
          </section>

          {/* Survey Users */}
          <section className="survey-users-section">
            <h2>Survey Users ({surveyUsers.length})</h2>
            {surveyUsers.length === 0 ? (
              <p className="survey-users-empty">No registered Survey users yet.</p>
            ) : (
              <div className="survey-users-table-wrap">
                <table className="survey-users-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Joined</th>
                      <th>Last Login</th>
                      <th>Plots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surveyUsers.map((user) => {
                      const isExpanded = expandedSurveyUserId === user.id;
                      return (
                        <Fragment key={user.id}>
                          <tr
                            className={`survey-user-row ${user.plot_count > 0 ? "clickable" : ""}`}
                            onClick={() => {
                              if (user.plot_count === 0) return;
                              setExpandedSurveyUserId((prev) => (prev === user.id ? null : user.id));
                            }}
                          >
                            <td className="survey-user-expand-cell">
                              {user.plot_count > 0 && (
                                <span className={`survey-user-caret ${isExpanded ? "open" : ""}`}>▶</span>
                              )}
                            </td>
                            <td>{user.email}</td>
                            <td>{user.full_name || "—"}</td>
                            <td>{formatDateTime(user.created_at)}</td>
                            <td>{formatDateTime(user.last_login_at)}</td>
                            <td>{user.plot_count}</td>
                          </tr>
                          {isExpanded && (
                            <tr className="survey-user-plots-row">
                              <td colSpan={6}>
                                <div className="survey-user-plots">
                                  {user.plots.map((plot) => {
                                    const plotIsProjected = isProjectedCoordinateSystem(plot.coordinate_system || "wgs84");
                                    return (
                                      <div key={plot.plot_id} className="survey-user-plot-card">
                                        <div className="survey-user-plot-card-header">
                                          <div className="survey-user-plot-info">
                                            <span className="survey-user-plot-title">
                                              {plot.title_text || `Plot #${plot.plot_id}`}
                                              {plot.workflow_type === "subdivision" && (
                                                <span className="plot-badge subdivision" title={plot.estate_name ? `Estate: ${plot.estate_name}` : undefined}>
                                                  Subdivision Lot
                                                </span>
                                              )}
                                            </span>
                                            <span className="survey-user-plot-meta">
                                              {plot.location_text || "No location"} · {formatTemplateName(plot.template_name)} ·{" "}
                                              {formatDateTime(plot.created_at)}
                                            </span>
                                          </div>
                                          <div className="survey-user-plot-downloads">
                                            {Object.entries(reportLinks(plot.plot_id)).map(([key, href]) => (
                                              <a
                                                key={key}
                                                className="survey-user-download-btn"
                                                href={href}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={(event) => event.stopPropagation()}
                                              >
                                                {reportLabels[key] || key}
                                              </a>
                                            ))}
                                          </div>
                                        </div>
                                        {plot.survey_input_coordinates.length > 0 && (
                                          <div className="survey-user-plot-coords">
                                            <div className="survey-user-plot-coords-label">
                                              As entered by the user · {formatCoordinateSystem(plot.coordinate_system)}
                                            </div>
                                            <div className="survey-user-coords-table-wrap">
                                              <table className="survey-user-coords-table">
                                                <thead>
                                                  <tr>
                                                    <th>Station</th>
                                                    <th>{plotIsProjected ? "Easting (m)" : "Longitude"}</th>
                                                    <th>{plotIsProjected ? "Northing (m)" : "Latitude"}</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {plot.survey_input_coordinates.map((pt, idx) => (
                                                    <tr key={idx}>
                                                      <td>{pt.station || `P${idx + 1}`}</td>
                                                      <td>{pt.x != null ? pt.x.toFixed(plotIsProjected ? 3 : 6) : "—"}</td>
                                                      <td>{pt.y != null ? pt.y.toFixed(plotIsProjected ? 3 : 6) : "—"}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Daily Chart */}
          <section className="chart-section">
            <h2>Daily Plot Creation (Last 14 Days)</h2>
            <div className="bar-chart">
              {dailyData.map((day) => (
                <div key={day.date} className="bar-wrapper">
                  <div
                    className="bar"
                    style={{ height: `${(day.count / maxCount) * 100}%` }}
                  >
                    <span className="bar-value">{day.count}</span>
                  </div>
                  <span className="bar-label">
                    {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Features Breakdown */}
          <section className="features-section">
            <h2>Detected Features</h2>
            <div className="features-grid">
              <div className="feature-stat">
                <span className="feature-icon building">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1h-2v-2a1 1 0 00-1-1H8a1 1 0 00-1 1v2H5a1 1 0 01-1-1V4z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <span className="feature-value">{analytics?.features_by_type?.building || 0}</span>
                  <span className="feature-label">Buildings</span>
                </div>
              </div>
              <div className="feature-stat">
                <span className="feature-icon road">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v2H2V6zM2 10h16v2H2v-2zm0 4h16v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2z" />
                  </svg>
                </span>
                <div>
                  <span className="feature-value">{analytics?.features_by_type?.road || 0}</span>
                  <span className="feature-label">Roads</span>
                </div>
              </div>
              <div className="feature-stat">
                <span className="feature-icon river">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.05 3.636a1 1 0 010 1.414 7 7 0 000 9.9 1 1 0 11-1.414 1.414 9 9 0 010-12.728 1 1 0 011.414 0zm9.9 0a1 1 0 011.414 0 9 9 0 010 12.728 1 1 0 11-1.414-1.414 7 7 0 000-9.9 1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <span className="feature-value">{analytics?.features_by_type?.river || 0}</span>
                  <span className="feature-label">Rivers</span>
                </div>
              </div>
              <div className="feature-stat total">
                <span className="feature-icon">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </span>
                <div>
                  <span className="feature-value">{analytics?.total_features || 0}</span>
                  <span className="feature-label">Total</span>
                </div>
              </div>
            </div>
          </section>

          {/* Feedback Summary */}
          <section className="feedback-section">
            <h2>Feedback Summary</h2>
            {feedbackData && feedbackData.total_feedback > 0 ? (
              <div className="feedback-grid">
                <div className="feedback-card">
                  <h3>Total Responses</h3>
                  <span className="feedback-value">{feedbackData.total_feedback}</span>
                </div>
                <div className="feedback-card">
                  <h3>Avg. Satisfaction</h3>
                  <span className="feedback-value">{feedbackData.avg_satisfaction}/5</span>
                </div>
                <div className="feedback-card wide">
                  <h3>Top Professions</h3>
                  <div className="profession-list">
                    {Object.entries(feedbackData.professions).slice(0, 5).map(([prof, count]) => (
                      <div key={prof} className="profession-item">
                        <span>{prof}</span>
                        <span className="count">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-feedback">
                <p>No feedback collected yet</p>
              </div>
            )}
          </section>

          {/* Plot Details */}
          <section className="usage-monitor-section">
            <div className="section-head">
              <div>
                <h2>Survey Usage Monitoring</h2>
                <p>Track who is creating plans, which templates they use, and how export activity is moving.</p>
              </div>
            </div>

            <div className="usage-summary-grid">
              <div className="usage-stat-card">
                <span className="usage-stat-label">Surveyors observed</span>
                <span className="usage-stat-value">{userMonitoring.length}</span>
              </div>
              <div className="usage-stat-card">
                <span className="usage-stat-label">Templates in use</span>
                <span className="usage-stat-value">{templateUsageRows.length}</span>
              </div>
              <div className="usage-stat-card">
                <span className="usage-stat-label">Export jobs</span>
                <span className="usage-stat-value">{exportTotals.total}</span>
              </div>
              <div className="usage-stat-card">
                <span className="usage-stat-label">Completed exports</span>
                <span className="usage-stat-value">{exportTotals.completed}</span>
              </div>
            </div>

            <div className="usage-monitor-grid">
              <div className="usage-panel">
                <div className="usage-panel-head">
                  <h3>Surveyor activity</h3>
                  <span>{userMonitoring.length} active profile(s)</span>
                </div>
                {userMonitoring.length === 0 ? (
                  <div className="usage-empty">No survey activity has been captured yet.</div>
                ) : (
                  <div className="usage-user-list">
                    {userMonitoring.map((entry) => (
                      <article key={entry.key} className="usage-user-card">
                        <div className="usage-user-top">
                          <div>
                            <h4>{entry.surveyorName}</h4>
                            <p>{entry.surveyorRank}</p>
                          </div>
                          <div className="usage-user-metric">
                            <strong>{entry.plotsCount}</strong>
                            <span>plots</span>
                          </div>
                        </div>
                        <div className="usage-user-grid">
                          <div className="usage-user-kv">
                            <span>Templates</span>
                            <strong>{entry.templates.join(", ") || "General"}</strong>
                          </div>
                          <div className="usage-user-kv">
                            <span>Paper sizes</span>
                            <strong>{entry.paperSizes.join(", ") || "A4"}</strong>
                          </div>
                          <div className="usage-user-kv">
                            <span>Coordinate systems</span>
                            <strong>{entry.coordinateSystems.join(", ") || "WGS84"}</strong>
                          </div>
                          <div className="usage-user-kv">
                            <span>Last activity</span>
                            <strong>{formatDateTime(entry.lastActivity)}</strong>
                          </div>
                          <div className="usage-user-kv">
                            <span>Export jobs</span>
                            <strong>
                              {entry.completedExportJobs}/{entry.totalExportJobs} completed
                            </strong>
                          </div>
                          <div className="usage-user-kv">
                            <span>Last export</span>
                            <strong>{formatExportType(entry.lastExportType)}</strong>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="usage-side-stack">
                <div className="usage-panel compact">
                  <div className="usage-panel-head">
                    <h3>Template choice</h3>
                    <span>Real selections</span>
                  </div>
                  {templateUsageRows.length === 0 ? (
                    <div className="usage-empty">No saved templates yet.</div>
                  ) : (
                    <div className="template-usage-list">
                      {templateUsageRows.map((row) => (
                        <div key={row.template} className="template-usage-row">
                          <span>{row.template}</span>
                          <strong>{row.count}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="usage-panel compact">
                  <div className="usage-panel-head">
                    <h3>Export queue health</h3>
                    <span>Across all plots</span>
                  </div>
                  <div className="export-health-grid">
                    <div className="export-health-item">
                      <span>Total</span>
                      <strong>{exportTotals.total}</strong>
                    </div>
                    <div className="export-health-item good">
                      <span>Completed</span>
                      <strong>{exportTotals.completed}</strong>
                    </div>
                    <div className="export-health-item muted">
                      <span>Queued</span>
                      <strong>{exportTotals.queued}</strong>
                    </div>
                    <div className="export-health-item accent">
                      <span>Running</span>
                      <strong>{exportTotals.running}</strong>
                    </div>
                    <div className="export-health-item bad">
                      <span>Failed</span>
                      <strong>{exportTotals.failed}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="plots-detail-section">
            <h2>OSM Overpass Usage (Non-Nigeria Feature Detection)</h2>
            {osmOverpassUsage.length === 0 ? (
              <div className="no-feedback">
                <p>No non-Nigeria plots detected yet - nothing has hit the Overpass fallback.</p>
              </div>
            ) : (
              <div className="plot-detail-list">
                {osmOverpassUsage.map((row) => (
                  <div key={row.country_hint} className="plot-detail-card">
                    <div className="plot-detail-header">
                      <div>
                        <span className="plot-detail-id">{row.country_hint}</span>
                        <span className="plot-detail-date">
                          {row.first_seen ? `First seen ${formatDateTime(row.first_seen)}` : ""}
                        </span>
                      </div>
                      <div className="plot-detail-badges">
                        <span className="plot-badge">{row.distinct_plots} plot{row.distinct_plots === 1 ? "" : "s"}</span>
                        <span className="plot-badge">{row.distinct_buckets} area{row.distinct_buckets === 1 ? "" : "s"}</span>
                        <span className="plot-badge">
                          {row.total_calls} call{row.total_calls === 1 ? "" : "s"} ({row.cache_hits} cached)
                        </span>
                        {row.avg_fetch_ms != null && (
                          <span className="plot-badge">~{Math.round(row.avg_fetch_ms)}ms/fetch</span>
                        )}
                      </div>
                    </div>
                    <div className="plot-detail-grid">
                      <div className="plot-detail-block">
                        <h4>Activity</h4>
                        <div className="plot-kv">
                          <span>Last seen</span>
                          <span>{formatDateTime(row.last_seen)}</span>
                        </div>
                        <div className="plot-kv">
                          <span>Cache hit rate</span>
                          <span>{row.total_calls > 0 ? `${Math.round((row.cache_hits / row.total_calls) * 100)}%` : "N/A"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="plots-detail-section">
            <h2>Survey Activity Audit</h2>
            {surveyActivity.length === 0 ? (
              <div className="no-feedback">
                <p>No server-confirmed Survey activity yet.</p>
              </div>
            ) : (
              <div className="plot-detail-list">
                {surveyActivity.map((event) => (
                  <div key={event.id} className="plot-detail-card">
                    <div className="plot-detail-header">
                      <div>
                        <span className="plot-detail-id">{formatSurveyActivity(event)}</span>
                        <span className="plot-detail-date">{formatDateTime(event.created_at)}</span>
                      </div>
                      <div className="plot-detail-badges">
                        <span className="plot-badge">{event.workflow.replace(/_/g, " ")}</span>
                        {event.preview_only && <span className="plot-badge">Preview only</span>}
                        {event.plot_id && <span className="plot-badge">Plot #{event.plot_id}</span>}
                        {event.subdivision_batch_id && <span className="plot-badge">Batch #{event.subdivision_batch_id}</span>}
                      </div>
                    </div>
                    <div className="plot-detail-grid">
                      <div className="plot-detail-block">
                        <h4>Actor</h4>
                        <div className="plot-kv"><span>User</span><span>{event.actor_name || event.actor_email || "Guest (preview before sign-in)"}</span></div>
                        {event.actor_name && event.actor_email && <div className="plot-kv"><span>Email</span><span>{event.actor_email}</span></div>}
                      </div>
                      <div className="plot-detail-block">
                        <h4>Outcome</h4>
                        <div className="plot-kv"><span>Event</span><span>{formatSurveyActivity(event)}</span></div>
                        {typeof event.details.export_type === "string" && <div className="plot-kv"><span>Export</span><span>{event.details.export_type}</span></div>}
                        {typeof event.details.file_name === "string" && <div className="plot-kv"><span>File</span><span>{event.details.file_name}</span></div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="plots-detail-section">
            <h2>Georeference Sessions</h2>
            {georeferenceSessions.length === 0 ? (
              <div className="no-feedback">
                <p>No georeference sessions available</p>
              </div>
            ) : (
              <div className="plot-detail-list">
                {georeferenceSessions.map((session) => (
                  <div key={session.id} className="plot-detail-card">
                    <div className="plot-detail-header">
                      <div>
                        <span className="plot-detail-id">
                          {session.title_text || `Session ${session.id.slice(0, 8)}`}
                        </span>
                        <span className="plot-detail-date">{formatDateTime(session.created_at)}</span>
                      </div>
                      <div className="plot-detail-badges">
                        <span className="plot-badge">{session.status || "draft"}</span>
                        <span className="plot-badge">
                          {formatCoordinateSystem(session.target_coordinate_system)}
                        </span>
                        {session.source_file_name && (
                          <span className="plot-badge">{session.source_file_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="plot-detail-grid">
                      <div className="plot-detail-block">
                        <h4>Session</h4>
                        <div className="plot-kv">
                          <span>Last Updated</span>
                          <span>{formatDateTime(session.updated_at)}</span>
                        </div>
                        <div className="plot-kv">
                          <span>Finalized</span>
                          <span>{session.finalized_at ? formatDateTime(session.finalized_at) : "Not finalized"}</span>
                        </div>
                      </div>
                      <div className="plot-detail-block">
                        <h4>Downloads</h4>
                        <a
                          className="survey-user-download-btn"
                          href={`${BACKEND_URL}/survey-georeference/sessions/${session.id}/exports/staking.csv`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          DGPS Staking CSV
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="plots-detail-section">
            <h2>Plot Details</h2>
            {plotDetails.length === 0 ? (
              <div className="no-feedback">
                <p>No plots available</p>
              </div>
            ) : (
              <div className="plot-detail-list">
                {plotDetails.map((plot) => (
                  <div key={plot.plot_id} className="plot-detail-card">
                    <div className="plot-detail-header">
                      <div>
                        <span className="plot-detail-id">Plot #{plot.plot_id}</span>
                        <span className="plot-detail-date">{formatDateTime(plot.created_at)}</span>
                      </div>
                      <div className="plot-detail-badges">
                        {plot.workflow_type === "subdivision" && (
                          <span className="plot-badge subdivision" title={plot.parent_plot_id ? `From Plot #${plot.parent_plot_id}` : undefined}>
                            Subdivision Lot{plot.subdivision_lot_no ? ` · ${plot.subdivision_lot_no}` : ""}
                          </span>
                        )}
                        <span className="plot-badge template">{formatTemplateName(plot.template_name)}</span>
                        <span className="plot-badge">{plot.scale_text || "Scale N/A"}</span>
                        <span className="plot-badge">{plot.paper_size || "A4"}</span>
                        <span className="plot-badge">{formatCoordinateSystem(plot.coordinate_system)}</span>
                      </div>
                    </div>

                    <div className="plot-detail-grid">
                      <div className="plot-detail-block">
                        <h4>Location</h4>
                        <div className="plot-kv">
                          <span>Title</span>
                          <span>{plot.title_text || "N/A"}</span>
                        </div>
                        <div className="plot-kv">
                          <span>Location</span>
                          <span>{plot.location_text || "N/A"}</span>
                        </div>
                        <div className="plot-kv">
                          <span>LGA</span>
                          <span>{plot.lga_text || "N/A"}</span>
                        </div>
                        <div className="plot-kv">
                          <span>State</span>
                          <span>{plot.state_text || "N/A"}</span>
                        </div>
                      </div>

                      <div className="plot-detail-block">
                        <h4>Surveyor Info</h4>
                        <div className="plot-kv">
                          <span>Name</span>
                          <span>{plot.surveyor_name || "N/A"}</span>
                        </div>
                        <div className="plot-kv">
                          <span>Rank</span>
                          <span>{plot.surveyor_rank || "N/A"}</span>
                        </div>
                        <div className="plot-kv">
                          <span>Last Updated</span>
                          <span>{formatDateTime(plot.meta_updated_at)}</span>
                        </div>
                        <div className="plot-kv">
                          <span>Template</span>
                          <span>{formatTemplateName(plot.template_name)}</span>
                        </div>
                      </div>

                      <div className="plot-detail-block">
                        <h4>Detected Features</h4>
                        {renderFeatureSummary(plot)}
                      </div>

                      <div className="plot-detail-block">
                        <h4>Usage Monitoring</h4>
                        <div className="plot-kv">
                          <span>Exports</span>
                          <span>{plot.export_summary?.total_jobs || 0}</span>
                        </div>
                        <div className="plot-kv">
                          <span>Completed</span>
                          <span>{plot.export_summary?.completed_jobs || 0}</span>
                        </div>
                        <div className="plot-kv">
                          <span>Failed</span>
                          <span>{plot.export_summary?.failed_jobs || 0}</span>
                        </div>
                        <div className="plot-kv">
                          <span>Latest Export</span>
                          <span>{formatExportType(plot.export_summary?.last_export_type)}</span>
                        </div>
                        <div className="plot-kv">
                          <span>Latest Status</span>
                          <span>{formatStatus(plot.export_summary?.last_export_status)}</span>
                        </div>
                        <div className="plot-kv">
                          <span>Last Export At</span>
                          <span>{formatDateTime(plot.export_summary?.last_export_at)}</span>
                        </div>
                      </div>

                      <div className="plot-detail-block">
                        <h4>Reports Generated</h4>
                        <div className="report-list">
                          {Object.entries(reportLabels).map(([key, label]) => (
                            <div key={key} className={`report-item ${plot.reports_generated?.[key] ? "ready" : "missing"}`}>
                              <span>{label}</span>
                              {plot.reports_generated?.[key] ? (
                                reportLinks(plot.plot_id)[key as keyof ReturnType<typeof reportLinks>] ? (
                                  <a
                                    className="report-action"
                                    href={reportLinks(plot.plot_id)[key as keyof ReturnType<typeof reportLinks>]}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open
                                  </a>
                                ) : (
                                  <span>Ready</span>
                                )
                              ) : (
                                <span>N/A</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="plot-detail-block full">
                        <h4>Geometry / Coordinates</h4>
                        <pre className="coords-block">
                          {plot.geometry
                            ? JSON.stringify(plot.geometry, null, 2)
                            : plot.coords && plot.coords.length > 0
                            ? JSON.stringify(plot.coords, null, 2)
                            : "N/A"}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Feedback Details */}
          <section className="feedback-detail-section">
            <h2>All Feedback Responses</h2>
            {feedbackEntries.length === 0 ? (
              <div className="no-feedback">
                <p>No feedback responses yet</p>
              </div>
            ) : (
              <div className="feedback-table-wrapper">
                <table className="feedback-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Profession</th>
                      <th>Experience</th>
                      <th>Useful Features</th>
                      <th>Problems</th>
                      <th>Feature Requests</th>
                      <th>Willing to Pay</th>
                      <th>Satisfaction</th>
                      <th>Email</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.id}</td>
                        <td>{entry.profession || "N/A"}</td>
                        <td>{entry.experience || "N/A"}</td>
                        <td>{entry.useful_features || "N/A"}</td>
                        <td className="long-text">{entry.problems || "N/A"}</td>
                        <td className="long-text">{entry.feature_requests || "N/A"}</td>
                        <td>{entry.willing_to_pay || "N/A"}</td>
                        <td>{entry.satisfaction || 0}</td>
                        <td>{entry.email || "N/A"}</td>
                        <td>{formatDateTime(entry.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
