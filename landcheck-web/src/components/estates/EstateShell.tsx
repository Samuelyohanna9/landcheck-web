import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { API_URL, api, extractApiErrorMessage } from "../../api/client";
import EstateIcon, { type EstateIconName } from "./EstateIcon";
import EstateModal from "./EstateModal";
import { clearEstateAuthSession, getEstateAuthSession } from "../../auth/estateAuth";
import { prefetchMapboxCore } from "../../utils/mapboxLoader";
import { useFloatingPopoverPosition } from "../../utils/useFloatingPopoverPosition";
import "../../styles/estate-dashboard.css";

export type EstateNavKey =
  | "dashboard" | "map" | "plots" | "customers" | "payments" | "commissions" | "survey" | "staking"
  | "documents" | "development" | "hazard" | "reports" | "audit" | "reconciliation" | "settings" | "notifications";

export const estateNavItems: Array<{ key: EstateNavKey; label: string; icon: EstateIconName; path: (estateId: string) => string }> = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", path: (id) => `/estates/${id}` },
  { key: "map", label: "Map & Plots", icon: "map", path: (id) => `/estates/${id}/map` },
  { key: "plots", label: "Plots", icon: "plots", path: (id) => `/estates/${id}/plots` },
  { key: "customers", label: "Customers", icon: "customers", path: (id) => `/estates/${id}/customers` },
  { key: "payments", label: "Sales & Payments", icon: "payments", path: () => "/estates/payments" },
  { key: "reconciliation", label: "Reconciliation", icon: "payments", path: () => "/estates/reconciliation" },
  { key: "commissions", label: "Commissions", icon: "wallet", path: () => "/estates/commissions" },
  { key: "survey", label: "Survey", icon: "survey", path: (id) => `/estates/${id}/survey` },
  { key: "staking", label: "Staking", icon: "staking", path: (id) => `/estates/${id}/staking` },
  { key: "documents", label: "Documents", icon: "documents", path: () => "/estates/documents" },
  { key: "development", label: "Development", icon: "development", path: (id) => `/estates/${id}/development` },
  { key: "hazard", label: "Hazard Analysis", icon: "hazard", path: (id) => `/estates/${id}/hazards` },
  { key: "reports", label: "Reports", icon: "reports", path: (id) => `/estates/${id}/reports` },
  { key: "audit", label: "Audit Timeline", icon: "audit", path: (id) => `/estates/${id}/timeline` },
  { key: "settings", label: "Settings", icon: "settings", path: (id) => `/estates/${id}/settings` },
  { key: "notifications", label: "Message Delivery", icon: "mail", path: (id) => `/estates/${id}/notifications` },
];

function relativeTime(value: string) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function humanizeRole(roleKey?: string | null) {
  if (!roleKey) return "Estate team";
  return roleKey.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function EstateShell({
  estateId,
  estateName,
  activeKey,
  search,
  onSearchChange,
  searchPlaceholder = "Search plots, customers, documents...",
  recentActivity = [],
  skipBillingGate = false,
  onEstateNameChange,
  children,
}: {
  estateId: string;
  estateName?: string;
  activeKey: EstateNavKey;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  recentActivity?: Array<{ id: number | string; action: string; created_at: string }>;
  /** The Billing page itself sets this - otherwise a Basic/past_due/cancelled organization would
   * get redirected away from the one page that lets it fix that, looping forever. */
  skipBillingGate?: boolean;
  onEstateNameChange?: (name: string) => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameValue, setRenameValue] = useState(estateName || "");
  const [displayEstateName, setDisplayEstateName] = useState(estateName || "Estate");
  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const estateSession = getEstateAuthSession();
  const activeItem = estateNavItems.find((item) => item.key === activeKey);
  const notifButtonRef = useRef<HTMLButtonElement>(null);
  const notifPopoverRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifPosition = useFloatingPopoverPosition(notifButtonRef, notifPopoverRef, notifOpen);
  const canRenameEstate = ["owner", "manager"].includes(String(estateSession?.user.role_key || "").toLowerCase());

  useEffect(() => {
    if (renameOpen) return;
    const nextName = estateName || "Estate";
    setDisplayEstateName(nextName);
    setRenameValue(nextName === "Estate" ? "" : nextName);
  }, [estateName, renameOpen]);

  const saveEstateName = async () => {
    const nextName = renameValue.trim();
    if (!estateId || !nextName) return;
    setRenameBusy(true);
    try {
      const response = await api.patch(`/estates/${estateId}`, { name: nextName });
      const savedName = String(response.data?.name || nextName);
      setDisplayEstateName(savedName);
      setRenameValue(savedName);
      setRenameOpen(false);
      onEstateNameChange?.(savedName);
      toast.success("Estate name updated.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Estate name could not be updated."));
    } finally {
      setRenameBusy(false);
    }
  };

  // Plain React state reset to 0 on every mount, which is every page load AND every login - so
  // the badge looked "seen" only until the next navigation or refresh, then came right back. This
  // persists the timestamp of the newest activity item the user has actually opened the dropdown
  // on, so a genuinely-seen notification stays seen across reloads and future sessions.
  const seenStorageKey = `edash_notif_seen_${estateId}`;
  const [seenTimestamp, setSeenTimestamp] = useState<string | null>(() => {
    try { return window.localStorage.getItem(seenStorageKey); } catch { return null; }
  });
  useEffect(() => {
    try { setSeenTimestamp(window.localStorage.getItem(seenStorageKey)); } catch { setSeenTimestamp(null); }
  }, [seenStorageKey]);
  const latestActivityTimestamp = recentActivity.reduce<string | null>(
    (latest, event) => (!latest || event.created_at > latest ? event.created_at : latest),
    null,
  );
  const unreadCount = seenTimestamp
    ? recentActivity.filter((event) => event.created_at > seenTimestamp).length
    : recentActivity.length;
  const markActivitySeen = () => {
    if (!latestActivityTimestamp) return;
    try { window.localStorage.setItem(seenStorageKey, latestActivityTimestamp); } catch { /* private mode or blocked storage - badge just won't persist as seen */ }
    setSeenTimestamp(latestActivityTimestamp);
  };

  // Every Estates page renders inside this shell, which makes it the one place to enforce "has a
  // trialing/active subscription" without touching every individual page - mirrors how the
  // backend enforces the same thing in one place (require_estate_access). The Billing page itself
  // opts out via skipBillingGate, since it's the one page an unpaid organization must still reach.
  useEffect(() => {
    if (skipBillingGate) return;
    const organizationId = estateSession?.user.organization_id;
    if (!organizationId) return;
    api.get("/estates/billing/status", { params: { organization_id: organizationId } })
      .then((response) => {
        if (!["trialing", "active"].includes(response.data?.status)) navigate("/estates/choose-plan", { replace: true });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipBillingGate, estateSession?.user.organization_id]);

  // The company logo is configured once in Estate settings and reused throughout the workspace.
  // Keep the account avatar for the signed-in person; the adjacent mark identifies the company.
  useEffect(() => {
    let mounted = true;
    api.get(`/estates/${estateId}/public-settings`)
      .then((response) => {
        if (mounted) setCompanyLogoPath(response.data?.public_logo_path || null);
      })
      .catch(() => {
        if (mounted) setCompanyLogoPath(null);
      });
    return () => { mounted = false; };
  }, [estateId]);

  const companyLogoUrl = companyLogoPath
    ? (companyLogoPath.startsWith("http") ? companyLogoPath : `${API_URL}${companyLogoPath}`)
    : null;

  // Keep the notification card dismissible even though it is portalled outside the dashboard
  // root. Pointer events also work reliably for touch taps on iPhone Safari.
  useEffect(() => {
    if (!notifOpen && !userMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (notifOpen && !notifButtonRef.current?.contains(target) && !notifPopoverRef.current?.contains(target)) setNotifOpen(false);
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(target)) setUserMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [notifOpen, userMenuOpen]);

  // The map bundle (mapbox-gl + its CSS) is a genuinely large download, and on a slow connection
  // waiting for it to even START after clicking "Map & Plots" is most of the visible delay. Warming
  // it in the background while someone is reading the Dashboard - the natural page before the map -
  // means it's often already cached by the time they navigate there. loadMapboxGl()/loadMapboxGlCss()
  // are memoized, so this is a no-op if the map has already been opened this session.
  useEffect(() => {
    if (activeKey === "dashboard") void prefetchMapboxCore();
  }, [activeKey]);

  // The mobile nav drawer follows the same dismissal conventions as a modal - Escape closes it,
  // in addition to the backdrop click and picking a nav item.
  useEffect(() => {
    if (!sidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  return (
    <div className={`edash${sidebarOpen ? " is-sidebar-open" : ""}`}>
      <Toaster position="top-right" />
      <div className="edash-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      <aside className="edash-sidebar">
        <div className="edash-sidebar-brand">
          <span className="edash-sidebar-brand-logo"><img src="/logo.svg" alt="LandCheck" width="520" height="140" /></span>
          <small className="edash-sidebar-brand-tag">Estates</small>
        </div>
        <nav className="edash-nav" aria-label="Estate navigation">
          {estateNavItems.map((item) => (
            <Link
              key={item.key}
              className={`edash-nav-item${item.key === activeKey ? " active" : ""}`}
              to={item.path(estateId)}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="edash-nav-icon"><EstateIcon name={item.icon} /></span>
              {item.label}
            </Link>
          ))}
        </nav>
        <button type="button" className="edash-sidebar-footer" onClick={() => setShowHelp(true)}>
          <span className="edash-nav-icon"><EstateIcon name="help" /></span>
          Help &amp; Support
        </button>
      </aside>
      <div className={`edash-main${activeKey === "map" ? " edash-main--fill" : ""}`}>
        <div className="edash-topbar">
          <button type="button" className="edash-menu-toggle" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle navigation">
            <EstateIcon name="menu" />
          </button>
          <div className="edash-breadcrumb">
            <span>Estates</span>
            <b>&rsaquo;</b>
            <span className="edash-breadcrumb-estate">
              <strong>{displayEstateName}</strong>
              {canRenameEstate && estateId && <button type="button" className="edash-breadcrumb-edit" onClick={() => { setRenameValue(displayEstateName === "Estate" ? "" : displayEstateName); setRenameOpen(true); }} aria-label="Edit estate name">Edit</button>}
            </span>
            <b>&rsaquo;</b>
            <strong>{activeItem?.label}</strong>
          </div>
          {onSearchChange ? (
            <label className="edash-search">
              <EstateIcon name="search" />
              <input value={search || ""} onChange={(event) => onSearchChange(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
            </label>
          ) : (
            <div className="edash-toolbar-spacer" style={{ flex: 1 }} />
          )}
          <div className="edash-topbar-right">
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="edash-icon-btn"
                ref={notifButtonRef}
                onClick={() => setNotifOpen((value) => { const next = !value; if (next) markActivitySeen(); return next; })}
                aria-label="Recent updates"
              >
                <EstateIcon name="bell" />
                {unreadCount > 0 && <span className="edash-notif-badge">{Math.min(unreadCount, 9)}</span>}
              </button>
            </div>
            <div style={{ position: "relative" }} ref={userMenuRef}>
              <div className="edash-user" onClick={() => setUserMenuOpen((value) => !value)}>
                {companyLogoUrl && (
                  <span className="edash-company-logo" title="Company logo">
                    <img src={companyLogoUrl} alt={`${estateSession?.user.organization_name || "Company"} logo`} />
                  </span>
                )}
                <span className="edash-user-avatar">{(estateSession?.user.full_name || estateSession?.user.organization_name || "E").slice(0, 1).toUpperCase()}</span>
                <div className="edash-user-meta">
                  <strong>{estateSession?.user.full_name || estateSession?.user.organization_name || "Estate team"}</strong>
                  <small>{humanizeRole(estateSession?.user.role_key)}</small>
                </div>
                <span className="edash-user-chevron"><EstateIcon name="chevron-down" /></span>
              </div>
              {userMenuOpen && (
                <div className="edash-card" style={{ position: "absolute", right: 0, top: 44, width: 180, zIndex: 20 }}>
                  <div className="edash-card-inner" style={{ padding: 6 }}>
                    <Link className="edash-nav-item" to="/estates/workspace" onClick={() => setUserMenuOpen(false)}>
                      <span className="edash-nav-icon"><EstateIcon name="grid" /></span>All estates
                    </Link>
                    <button
                      type="button"
                      className="edash-nav-item"
                      style={{ width: "100%", border: "none", background: "transparent", cursor: "pointer" }}
                      onClick={() => { clearEstateAuthSession(); navigate("/estates", { replace: true }); }}
                    >
                      <span className="edash-nav-icon"><EstateIcon name="close" /></span>Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {notifOpen && notifPosition && createPortal(
          <div
            ref={notifPopoverRef}
            className="edash-notification-popover"
            style={{ top: notifPosition.top, left: notifPosition.left }}
            role="dialog"
            aria-label="Recent updates"
          >
            <div className="edash-card-inner" style={{ padding: 12 }}>
              <div className="edash-card-head" style={{ marginBottom: 8 }}>
                <p className="edash-card-title" style={{ fontSize: "0.82rem" }}>Recent updates</p>
              </div>
              {recentActivity.length ? (
                <div className="edash-activity-list">
                  {recentActivity.slice(0, 5).map((event) => (
                    <div key={event.id} className="edash-activity-item">
                      <span className="edash-activity-icon tone-neutral"><EstateIcon name="activity" /></span>
                      <div className="edash-activity-body">
                        <strong>{String(event.action || "").replaceAll("_", " ")}</strong>
                        <span>{relativeTime(event.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--edash-faint)", fontSize: "0.8rem" }}>No activity yet.</p>
              )}
              <Link className="edash-card-link" style={{ display: "block", marginTop: 10, textAlign: "center" }} to={`/estates/${estateId}/timeline`} onClick={() => setNotifOpen(false)}>
                View all activity
              </Link>
            </div>
          </div>,
          document.body,
        )}
        <div className={`edash-body${activeKey === "map" ? " edash-body--fill" : ""}`}>{children}</div>
      </div>
      {renameOpen && (
        <EstateModal title="Rename estate" subtitle="Update the name shown across your Estate workspace and reports." onClose={() => setRenameOpen(false)}>
          <label className="edash-field" style={{ marginBottom: 14 }}>
            <span>Estate name</span>
            <input value={renameValue} maxLength={255} autoFocus onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && renameValue.trim()) void saveEstateName(); }} />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="edash-btn-outline" disabled={renameBusy} onClick={() => setRenameOpen(false)}>Cancel</button>
            <button type="button" className="edash-btn-primary" disabled={renameBusy || !renameValue.trim()} onClick={() => void saveEstateName()}>{renameBusy ? "Saving..." : "Save name"}</button>
          </div>
        </EstateModal>
      )}
      {showHelp && (
        <EstateModal title="Help & Support" subtitle="We usually reply within one business day." onClose={() => setShowHelp(false)}>
          <p className="edash-status-row-desc" style={{ marginBottom: 14 }}>
            Stuck on something, found a bug, or want a hand setting up an Estate? Email us and include your organization name and, if relevant, the plot or estate you're working on.
          </p>
          <a className="edash-btn-primary" style={{ display: "inline-flex", marginBottom: 8 }} href="mailto:support@landcheck.online?subject=LandCheck%20Estates%20Support">
            <EstateIcon name="mail" /> Email support@landcheck.online
          </a>
          <p className="edash-field-note">
            For hazard or geometry questions, the Audit Timeline and Reports pages often have the detail our team will ask for first.
          </p>
        </EstateModal>
      )}
    </div>
  );
}
