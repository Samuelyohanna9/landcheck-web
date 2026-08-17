import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { api } from "../api/client";
import { clearSurveyAuthSession, getSurveyAuthSession } from "../auth/surveyAuth";
import ProfileAvatarMenu from "../components/ProfileAvatarMenu";
import { useFloatingPopoverPosition } from "../utils/useFloatingPopoverPosition";
import "../styles/survey-tokens.css";
import "../styles/dashboard.css";
import { prefetchSurveyPlanPreviewStep, prefetchSurveyPlanRoute } from "../utils/surveyPlanPrefetch";

type WorkflowCategory = "survey_plan" | "subdivision" | "georeference";

type MyPlot = {
  plot_id: number;
  created_at: string | null;
  title: string | null;
  location: string | null;
  scale: string | null;
  status: "draft" | "completed";
  workflow_type: WorkflowCategory;
  parent_plot_id: number | null;
  subdivision_batch_id: number | null;
  subdivision_lot_no: string | null;
  estate_name: string | null;
};

type MyGeorefSession = {
  session_id: string;
  title: string | null;
  status: string;
  coordinate_system: string | null;
  source_file_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  finalized_at: string | null;
};

type StatusFilter = "all" | "completed" | "draft";
type CategoryFilter = "all" | WorkflowCategory;

type WorkItem = {
  key: string;
  category: WorkflowCategory;
  title: string;
  subtitle: string | null;
  createdAt: string | null;
  statusBucket: "completed" | "draft";
  statusLabel: string;
  plotId?: number;
  sessionId?: string;
};

const CATEGORY_META: Record<
  WorkflowCategory,
  { label: string; short: string; tooltip: string; newLabel: string; newTooltip: string; accentClass: string }
> = {
  survey_plan: {
    label: "Survey Plan",
    short: "Survey",
    tooltip: "A single parcel surveyed and drafted into a registrable plan.",
    newLabel: "New Survey Plan",
    newTooltip: "Survey and draft a single land parcel.",
    accentClass: "work-badge-survey",
  },
  subdivision: {
    label: "Subdivision",
    short: "Subdivision",
    tooltip: "An estate or larger parcel split into individually titled lots.",
    newLabel: "New Subdivision",
    newTooltip: "Split an estate or parcel into multiple lots.",
    accentClass: "work-badge-subdivision",
  },
  georeference: {
    label: "Georeferencing",
    short: "Georeference",
    tooltip: "A scanned map or photo aligned to real-world coordinates.",
    newLabel: "New Georeference Plan",
    newTooltip: "Align a scanned map or photo to real-world coordinates.",
    accentClass: "work-badge-georeference",
  },
};

const CATEGORY_ORDER: WorkflowCategory[] = ["survey_plan", "subdivision", "georeference"];

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

const georefStatusLabel = (status: string) => {
  if (status === "digitized") return "Completed";
  if (status === "georeferenced") return "In Progress";
  return "Draft";
};

function NewWorkMenu({ onNavigate }: { onNavigate: (category: WorkflowCategory) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const position = useFloatingPopoverPosition(triggerRef, popoverRef, open);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="new-work-menu" ref={containerRef}>
      <div className="new-work-split">
        <button
          type="button"
          className="new-plot-btn new-work-primary"
          title={CATEGORY_META.survey_plan.newTooltip}
          onClick={() => onNavigate("survey_plan")}
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          New Survey Plan
        </button>
        <button
          type="button"
          ref={triggerRef}
          className="new-plot-btn new-work-caret"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label="More new-project options"
          onClick={() => setOpen((prev) => !prev)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      {open && position
        ? createPortal(
            <div ref={popoverRef} className="new-work-popover" style={{ top: position.top, left: position.left }}>
              {CATEGORY_ORDER.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="new-work-option"
                  title={CATEGORY_META[category].newTooltip}
                  onClick={() => {
                    setOpen(false);
                    onNavigate(category);
                  }}
                >
                  <span className={`work-badge ${CATEGORY_META[category].accentClass}`}>
                    {CATEGORY_META[category].short}
                  </span>
                  {CATEGORY_META[category].newLabel}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function SupportModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) {
      toast.error("Describe your question or problem before sending.");
      return;
    }
    setSending(true);
    try {
      await api.post("/feedback/support", {
        subject: subject.trim(),
        message: message.trim(),
        page_context: "dashboard",
      });
      toast.success("Message sent. We'll reply by email.");
      setSubject("");
      setMessage("");
      onClose();
    } catch {
      toast.error("Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="support-modal-backdrop" onMouseDown={onClose}>
      <div className="support-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="support-modal-header">
          <h3>Need help?</h3>
          <button type="button" className="support-modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <p className="support-modal-intro">
          Ask a question or report a problem — it goes straight to the LandCheck team, with your
          account email attached so we can reply.
        </p>
        <form onSubmit={handleSubmit} className="support-modal-form">
          <label className="support-modal-label" htmlFor="support-subject">
            Subject
          </label>
          <input
            id="support-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Subdivision export failed"
            maxLength={200}
          />
          <label className="support-modal-label" htmlFor="support-message">
            Message <span className="required">*</span>
          </label>
          <textarea
            id="support-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what's going on..."
            rows={5}
            required
          />
          <div className="support-modal-actions">
            <button type="button" className="support-modal-cancel" onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button type="submit" className="support-modal-submit" disabled={sending}>
              {sending ? "Sending..." : "Send message"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const session = getSurveyAuthSession();
  const [plots, setPlots] = useState<MyPlot[]>([]);
  const [georefSessions, setGeorefSessions] = useState<MyGeorefSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [deletingGeorefId, setDeletingGeorefId] = useState<string | null>(null);

  const warmSurveyPlanEntry = () => {
    void prefetchSurveyPlanRoute();
    void prefetchSurveyPlanPreviewStep();
  };

  const loadWork = () => {
    setLoading(true);
    return Promise.allSettled([api.get("/plots/mine"), api.get("/survey-georeference/sessions/mine")]).then(
      ([plotsRes, georefRes]) => {
        setPlots(plotsRes.status === "fulfilled" ? plotsRes.value.data?.plots || [] : []);
        setGeorefSessions(georefRes.status === "fulfilled" ? georefRes.value.data?.sessions || [] : []);
        setLoading(false);
      },
    );
  };

  useEffect(() => {
    let active = true;
    loadWork().then(() => {
      if (!active) setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items: WorkItem[] = useMemo(() => {
    const plotItems: WorkItem[] = plots.map((p) => ({
      key: `plot-${p.plot_id}`,
      category: p.workflow_type,
      title:
        p.title ||
        (p.workflow_type === "subdivision" ? `Lot ${p.subdivision_lot_no || p.plot_id}` : `Untitled Plot #${p.plot_id}`),
      subtitle: p.workflow_type === "subdivision" ? p.estate_name || p.location : p.location,
      createdAt: p.created_at,
      statusBucket: p.status,
      statusLabel: p.status === "completed" ? "Completed" : "Draft",
      plotId: p.plot_id,
    }));
    const georefItems: WorkItem[] = georefSessions.map((s) => ({
      key: `georef-${s.session_id}`,
      category: "georeference" as const,
      title: s.title || s.source_file_name || `Session ${s.session_id.slice(0, 8)}`,
      subtitle: s.source_file_name,
      createdAt: s.updated_at || s.created_at,
      statusBucket: s.status === "digitized" ? "completed" : "draft",
      statusLabel: georefStatusLabel(s.status),
      sessionId: s.session_id,
    }));
    return [...plotItems, ...georefItems].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [plots, georefSessions]);

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = { all: items.length, survey_plan: 0, subdivision: 0, georeference: 0 };
    items.forEach((item) => {
      counts[item.category] += 1;
    });
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (statusFilter !== "all" && item.statusBucket !== statusFilter) return false;
      if (!query) return true;
      const haystack = `${item.title} ${item.subtitle || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [items, searchQuery, statusFilter, categoryFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pagedItems = filteredItems.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, categoryFilter]);

  const displayName = (session?.user?.full_name || "").trim() || "Surveyor";

  const handleSignOut = () => {
    clearSurveyAuthSession();
    navigate("/survey");
  };

  const goToNewWork = (category: WorkflowCategory) => {
    warmSurveyPlanEntry();
    if (category === "survey_plan") {
      navigate("/survey-plan");
      return;
    }
    navigate(`/survey-plan?mode=${category === "subdivision" ? "subdivision" : "georeference"}`);
  };

  const openItem = (item: WorkItem) => {
    if (item.category === "georeference" && item.sessionId) {
      navigate(`/survey-plan?mode=georeference&session=${encodeURIComponent(item.sessionId)}`);
      return;
    }
    if (item.statusBucket === "completed" && item.plotId) {
      window.open(`${api.defaults.baseURL}/plots/${item.plotId}/download/pdf`, "_blank", "noreferrer");
      return;
    }
    navigate(`/survey-plan?mode=${item.category === "subdivision" ? "subdivision" : "survey"}`);
  };

  const selectablePagedIds = pagedItems.filter((i) => i.plotId != null).map((i) => i.plotId as number);
  const allOnPageSelected = selectablePagedIds.length > 0 && selectablePagedIds.every((id) => selectedIds.has(id));

  const toggleSelected = (plotId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(plotId)) next.delete(plotId);
      else next.add(plotId);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        selectablePagedIds.forEach((id) => next.delete(id));
      } else {
        selectablePagedIds.forEach((id) => next.add(id));
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

  const handleDeleteGeoref = async (sessionId: string, title: string) => {
    const confirmed = window.confirm(`Delete "${title}"? This can't be undone.`);
    if (!confirmed) return;
    setDeletingGeorefId(sessionId);
    try {
      await api.delete(`/survey-georeference/sessions/${encodeURIComponent(sessionId)}`);
      setGeorefSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      toast.success("Georeference session deleted.");
    } catch {
      toast.error("Could not delete this session. Please try again.");
    } finally {
      setDeletingGeorefId(null);
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
            type="button"
            className="support-btn"
            title="Ask a question or report a problem"
            aria-label="Help and support"
            onClick={() => setSupportOpen(true)}
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.005a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75 1.5 1.5 0 10-1.06-2.47zM10 15a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <span>Help</span>
          </button>
          <NewWorkMenu onNavigate={goToNewWork} />
          {session?.user && (
            <ProfileAvatarMenu
              email={session.user.email}
              fullName={session.user.full_name}
              onSignOut={handleSignOut}
            />
          )}
        </div>
      </header>

      <div className="work-category-tabs" role="tablist" aria-label="Filter by project type">
        {(["all", ...CATEGORY_ORDER] as CategoryFilter[]).map((category) => (
          <button
            key={category}
            type="button"
            role="tab"
            aria-selected={categoryFilter === category}
            className={`work-category-tab${categoryFilter === category ? " is-active" : ""}`}
            title={category === "all" ? "Show every project type" : CATEGORY_META[category as WorkflowCategory].tooltip}
            onClick={() => setCategoryFilter(category)}
          >
            <span className={`work-category-tab-dot ${category === "all" ? "" : CATEGORY_META[category as WorkflowCategory].accentClass}`} />
            {category === "all" ? "All Work" : CATEGORY_META[category as WorkflowCategory].label}
            <span className="work-category-tab-count">{categoryCounts[category]}</span>
          </button>
        ))}
      </div>

      <div className="plots-section">
        <div className="plots-section-head">
          <h2>
            Recent Work
            {!loading && <span className="plots-count-badge">{filteredItems.length}</span>}
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
        ) : items.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <h3>No projects yet</h3>
            <p>Start a Survey Plan, Subdivision, or Georeference plan to see it here</p>
            <button
              onMouseEnter={warmSurveyPlanEntry}
              onFocus={warmSurveyPlanEntry}
              onTouchStart={warmSurveyPlanEntry}
              onClick={() => navigate("/survey-plan")}
            >
              Create Survey Plan
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-state">
            <h3>No matching projects</h3>
            <p>Try a different search term or filter.</p>
          </div>
        ) : (
          <>
            {selectablePagedIds.length > 0 && (
              <div className="workspace-select-all-row">
                <label className="workspace-checkbox">
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} />
                  <span>Select all on this page</span>
                </label>
              </div>
            )}

            <div className="workspace-project-list">
              {pagedItems.map((item) => {
                const meta = CATEGORY_META[item.category];
                const isSelectable = item.plotId != null;
                return (
                  <div
                    key={item.key}
                    className={`workspace-project-row${isSelectable && selectedIds.has(item.plotId as number) ? " is-selected" : ""}`}
                  >
                    {isSelectable ? (
                      <label className="workspace-checkbox workspace-project-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.plotId as number)}
                          onChange={() => toggleSelected(item.plotId as number)}
                          aria-label={`Select ${item.title}`}
                        />
                      </label>
                    ) : (
                      <span className="workspace-project-checkbox workspace-project-checkbox-spacer" aria-hidden="true" />
                    )}
                    <div className="workspace-project-info">
                      <span className="workspace-project-title">
                        <span className="workspace-project-title-text">{item.title}</span>
                        <span className={`work-badge ${meta.accentClass}`} title={meta.tooltip}>
                          {meta.short}
                        </span>
                      </span>
                      <span className="workspace-project-meta">
                        {item.subtitle && <span>{item.subtitle}</span>}
                        {formatDate(item.createdAt) && <span>{formatDate(item.createdAt)}</span>}
                      </span>
                    </div>
                    <span
                      className={`workspace-status-pill workspace-status-${item.statusBucket}`}
                      title={
                        item.statusBucket === "completed"
                          ? "Ready to open or download."
                          : "Not finished yet - pick up where you left off."
                      }
                    >
                      {item.statusLabel}
                    </span>
                    <button
                      className="workspace-project-action"
                      title={item.statusBucket === "completed" ? "Open the finished document" : "Continue this draft"}
                      onClick={() => openItem(item)}
                    >
                      {item.category === "georeference" ? "Open" : item.statusBucket === "completed" ? "Open" : "Continue"}
                    </button>
                    {item.category === "georeference" && item.sessionId && (
                      <button
                        className="workspace-project-action workspace-project-action-danger"
                        title="Delete this georeference session"
                        disabled={deletingGeorefId === item.sessionId}
                        onClick={() => handleDeleteGeoref(item.sessionId as string, item.title)}
                      >
                        {deletingGeorefId === item.sessionId ? "..." : "Delete"}
                      </button>
                    )}
                  </div>
                );
              })}
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

      <SupportModal isOpen={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}
