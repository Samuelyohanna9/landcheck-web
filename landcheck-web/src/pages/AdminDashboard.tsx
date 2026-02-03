import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
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
  geometry: { type: string; coordinates: number[][][] } | null;
  coords: number[][];
  detected_features: {
    inside: Record<string, number>;
    buffer: Record<string, number>;
  };
  reports_generated: Record<string, boolean>;
  meta_updated_at: string | null;
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
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [feedbackData, setFeedbackData] = useState<FeedbackSummary | null>(null);
  const [plotDetails, setPlotDetails] = useState<PlotDetail[]>([]);
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const results = await Promise.allSettled([
          api.get("/analytics/overview"),
          api.get("/analytics/plots/daily?days=14"),
          api.get("/analytics/feedback"),
          api.get("/analytics/plots/details"),
          api.get("/feedback"),
        ]);

        const [analyticsRes, dailyRes, feedbackRes, plotsRes, feedbackListRes] = results;

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
          setPlotDetails(plotsRes.value.data || []);
        }
        if (feedbackListRes.status === "fulfilled") {
          setFeedbackEntries(feedbackListRes.value.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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
        <span className="last-updated">
          {analytics?.generated_at && `Updated: ${new Date(analytics.generated_at).toLocaleString()}`}
        </span>
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
                        <span className="plot-badge">{plot.scale_text || "Scale N/A"}</span>
                        <span className="plot-badge">{plot.paper_size || "A4"}</span>
                        <span className="plot-badge">{plot.coordinate_system || "WGS84"}</span>
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
                      </div>

                      <div className="plot-detail-block">
                        <h4>Detected Features</h4>
                        {renderFeatureSummary(plot)}
                      </div>

                      <div className="plot-detail-block">
                        <h4>Reports Generated</h4>
                        <div className="report-list">
                          {Object.entries(reportLabels).map(([key, label]) => (
                            <div key={key} className={`report-item ${plot.reports_generated?.[key] ? "ready" : "missing"}`}>
                              <span>{label}</span>
                              <span>{plot.reports_generated?.[key] ? "Ready" : "N/A"}</span>
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
