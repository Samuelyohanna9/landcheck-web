import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { api } from "../api/client";
import { clearSurveyAuthSession, getSurveyAuthSession } from "../auth/surveyAuth";
import ProfileAvatarMenu from "../components/ProfileAvatarMenu";
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

type StatusFilter = "all" | "completed" | "draft";

const QUICK_TOOLS: { mode: "survey" | "subdivision" | "georeference"; label: string }[] = [
  { mode: "survey", label: "Survey Plan" },
  { mode: "subdivision", label: "Subdivision" },
  { mode: "georeference", label: "Georeference Plan" },
];

const PAGE_SIZE = 8;

const greetingForNow = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const formatDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

export default function Dashboard() {
  const navigate = useNavigate();
  const session = getSurveyAuthSession();
  const [plots, setPlots] = useState<MyPlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(false);

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

  const filteredPlots = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return plots.filter((plot) => {
      if (statusFilter !== "all" && plot.status !== statusFilter) return false;
      if (!query) return true;
      const haystack = `${plot.title || ""} ${plot.location || ""} #${plot.plot_id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [plots, searchQuery, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredPlots.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pagedPlots = filteredPlots.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  const displayName = (session?.user?.full_name || "").trim() || "Surveyor";

  const handleSignOut = () => {
    clearSurveyAuthSession();
    navigate("/survey");
  };

  const toggleSelected = (plotId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(plotId)) next.delete(plotId);
      else next.add(plotId);
      return next;
    });
  };

  const allOnPageSelected = pagedPlots.length > 0 && pagedPlots.every((p) => selectedIds.has(p.plot_id));

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        pagedPlots.forEach((p) => next.delete(p.plot_id));
      } else {
        pagedPlots.forEach((p) => next.add(p.plot_id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const confirmed = window.confirm(
      `Delete ${ids.length} project${ids.length === 1 ? "" : "s"}? This can't be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await api.post<{ deleted: number[] }>("/plots/bulk-delete", { plot_ids: ids });
      const deletedIds = new Set(res.data?.deleted || []);
      setPlots((prev) => prev.filter((p) => !deletedIds.has(p.plot_id)));
      clearSelection();
      toast.success(
        deletedIds.size === ids.length
          ? `Deleted ${deletedIds.size} project${deletedIds.size === 1 ? "" : "s"}.`
          : `Deleted ${deletedIds.size} of ${ids.length} selected.`
      );
    } catch {
      toast.error("Could not delete the selected projects. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="dashboard-container workspace-container">
      <Toaster position="top-right" />
      <header className="dashboard-header">
        <div className="header-left">
          <button className="dashboard-logo-btn" onClick={() => navigate("/")} aria-label="Go to LandCheck home">
            <img src="/logo.svg" alt="LandCheck" width="132" height="36" />
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
          {session?.user && (
            <ProfileAvatarMenu
              email={session.user.email}
              fullName={session.user.full_name}
              onSignOut={handleSignOut}
            />
          )}
        </div>
      </header>

      <div className="plots-section">
        <div className="plots-section-head">
          <h2>
            Recent Projects
            {!loading && <span className="plots-count-badge">{filteredPlots.length}</span>}
          </h2>

          <div className="workspace-toolbar">
            <div className="workspace-search">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                placeholder="Search by title or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="workspace-status-filter" role="tablist" aria-label="Filter by status">
              {(["all", "completed", "draft"] as StatusFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === filter}
                  className={`workspace-status-filter-btn${statusFilter === filter ? " is-active" : ""}`}
                  onClick={() => setStatusFilter(filter)}
                >
                  {filter === "all" ? "All" : filter === "completed" ? "Completed" : "Draft"}
                </button>
              ))}
            </div>
          </div>
        </div>

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
        ) : filteredPlots.length === 0 ? (
          <div className="empty-state">
            <h3>No matching projects</h3>
            <p>Try a different search term or filter.</p>
          </div>
        ) : (
          <>
            <div className="workspace-select-all-row">
              <label className="workspace-checkbox">
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} />
                <span>Select all on this page</span>
              </label>
            </div>

            <div className="workspace-project-list">
              {pagedPlots.map((plot) => (
                <div
                  key={plot.plot_id}
                  className={`workspace-project-row${selectedIds.has(plot.plot_id) ? " is-selected" : ""}`}
                >
                  <label className="workspace-checkbox workspace-project-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(plot.plot_id)}
                      onChange={() => toggleSelected(plot.plot_id)}
                      aria-label={`Select ${plot.title || `Untitled Plot #${plot.plot_id}`}`}
                    />
                  </label>
                  <div className="workspace-project-info">
                    <span className="workspace-project-title">{plot.title || `Untitled Plot #${plot.plot_id}`}</span>
                    <span className="workspace-project-meta">
                      {plot.location && <span>{plot.location}</span>}
                      {formatDate(plot.created_at) && <span>{formatDate(plot.created_at)}</span>}
                    </span>
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

            {pageCount > 1 && (
              <div className="workspace-pagination">
                <button
                  type="button"
                  disabled={clampedPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="workspace-pagination-status">
                  Page {clampedPage} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={clampedPage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </>
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

      {selectedIds.size > 0 && (
        <div className="workspace-bulk-bar">
          <span>{selectedIds.size} selected</span>
          <div className="workspace-bulk-bar-actions">
            <button type="button" className="workspace-bulk-cancel" onClick={clearSelection} disabled={deleting}>
              Cancel
            </button>
            <button type="button" className="workspace-bulk-delete" onClick={handleBulkDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete selected"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
