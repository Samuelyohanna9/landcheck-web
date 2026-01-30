import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/dashboard.css";

type SavedPlot = {
  id: number;
  createdAt: string;
  title: string;
  location: string;
  scale: string;
  coordinates: { station: string; lng: number; lat: number }[];
};

const STORAGE_KEY = "landcheck_plots";

export default function Dashboard() {
  const navigate = useNavigate();
  const [plots, setPlots] = useState<SavedPlot[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Load plots from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setPlots(JSON.parse(stored));
      } catch {
        setPlots([]);
      }
    }
  }, []);

  // Filter plots by search
  const filteredPlots = plots.filter((plot) => {
    const query = searchQuery.toLowerCase();
    return (
      plot.title.toLowerCase().includes(query) ||
      plot.location.toLowerCase().includes(query) ||
      plot.id.toString().includes(query)
    );
  });

  const deletePlot = (id: number) => {
    if (confirm("Are you sure you want to delete this plot?")) {
      const updated = plots.filter((p) => p.id !== id);
      setPlots(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate("/")}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <h1>My Dashboard</h1>
        </div>
        <button className="new-plot-btn" onClick={() => navigate("/survey-plan")}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          New Survey Plan
        </button>
      </header>

      {/* Stats Cards */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon plots-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{plots.length}</span>
            <span className="stat-label">Total Plots</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon recent-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">
              {plots.filter((p) => {
                const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                return new Date(p.createdAt) > dayAgo;
              }).length}
            </span>
            <span className="stat-label">Today</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon storage-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">Local</span>
            <span className="stat-label">Storage</span>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="search-bar">
        <svg viewBox="0 0 20 20" fill="currentColor" className="search-icon">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          type="text"
          placeholder="Search by title, location, or plot ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Plots List */}
      <div className="plots-section">
        <h2>Recent Plots</h2>

        {plots.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <h3>No plots yet</h3>
            <p>Create your first survey plan to see it here</p>
            <button onClick={() => navigate("/survey-plan")}>
              Create Survey Plan
            </button>
          </div>
        ) : filteredPlots.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3>No results found</h3>
            <p>Try adjusting your search query</p>
          </div>
        ) : (
          <div className="plots-grid">
            {filteredPlots.map((plot) => (
              <div key={plot.id} className="plot-card">
                <div className="plot-header">
                  <span className="plot-id">Plot #{plot.id}</span>
                  <span className="plot-date">{formatDate(plot.createdAt)}</span>
                </div>
                <h3 className="plot-title">{plot.title || "Untitled Plot"}</h3>
                <div className="plot-details">
                  <div className="detail-item">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    <span>{plot.location || "No location"}</span>
                  </div>
                  <div className="detail-item">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 12H9v-2h2v2zm0-4H9V6h2v4z" />
                    </svg>
                    <span>{plot.scale}</span>
                  </div>
                  <div className="detail-item">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
                    </svg>
                    <span>{plot.coordinates?.length || 0} points</span>
                  </div>
                </div>
                <div className="plot-actions">
                  <button className="action-btn view-btn" title="View Details">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <a
                    href={`http://127.0.0.1:8000/plots/${plot.id}/report/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="action-btn download-btn"
                    title="Download PDF"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </a>
                  <button
                    className="action-btn delete-btn"
                    onClick={() => deletePlot(plot.id)}
                    title="Delete"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Banner */}
      <div className="info-banner">
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <p>
          <strong>Note:</strong> Your plots are stored locally in your browser.
          Sign up for a free account to sync across devices and access advanced features.
        </p>
        <button className="coming-soon-tag" disabled>Coming Soon</button>
      </div>
    </div>
  );
}
