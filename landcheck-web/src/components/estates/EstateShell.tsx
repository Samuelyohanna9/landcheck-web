import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { api } from "../../api/client";
import EstateIcon, { type EstateIconName } from "./EstateIcon";
import EstateModal from "./EstateModal";
import { clearEstateAuthSession, getEstateAuthSession } from "../../auth/estateAuth";
import { prefetchMapboxCore } from "../../utils/mapboxLoader";
import "../../styles/estate-dashboard.css";

export type EstateNavKey =
  | "dashboard" | "map" | "plots" | "customers" | "payments" | "commissions" | "survey" | "staking"
  | "documents" | "development" | "hazard" | "reports" | "audit" | "settings";

export const estateNavItems: Array<{ key: EstateNavKey; label: string; icon: EstateIconName; path: (estateId: string) => string }> = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", path: (id) => `/estates/${id}` },
  { key: "map", label: "Map & Plots", icon: "map", path: (id) => `/estates/${id}/map` },
  { key: "plots", label: "Plots", icon: "plots", path: (id) => `/estates/${id}/plots` },
  { key: "customers", label: "Customers", icon: "customers", path: (id) => `/estates/${id}/customers` },
  { key: "payments", label: "Sales & Payments", icon: "payments", path: () => "/estates/payments" },
  { key: "commissions", label: "Commissions", icon: "wallet", path: () => "/estates/commissions" },
  { key: "survey", label: "Survey", icon: "survey", path: (id) => `/estates/${id}/survey` },
  { key: "staking", label: "Staking", icon: "staking", path: (id) => `/estates/${id}/staking` },
  { key: "documents", label: "Documents", icon: "documents", path: () => "/estates/documents" },
  { key: "development", label: "Development", icon: "development", path: (id) => `/estates/${id}/development` },
  { key: "hazard", label: "Hazard Analysis", icon: "hazard", path: (id) => `/estates/${id}/hazards` },
  { key: "reports", label: "Reports", icon: "reports", path: (id) => `/estates/${id}/reports` },
  { key: "audit", label: "Audit Timeline", icon: "audit", path: (id) => `/estates/${id}/timeline` },
  { key: "settings", label: "Settings", icon: "settings", path: (id) => `/estates/${id}/settings` },
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
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const estateSession = getEstateAuthSession();
  const activeItem = estateNavItems.find((item) => item.key === activeKey);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  // Without this, these dropdowns only ever close via their own toggle button - clicking
  // anywhere else on the page (including the other dropdown) leaves them stuck open.
  useEffect(() => {
    if (!notifOpen && !userMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (notifOpen && notifRef.current && !notifRef.current.contains(event.target as Node)) setNotifOpen(false);
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
            <strong>{estateName || "Estate"}</strong>
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
            <div style={{ position: "relative" }} ref={notifRef}>
              <button
                type="button"
                className="edash-icon-btn"
                onClick={() => setNotifOpen((value) => { const next = !value; if (next) markActivitySeen(); return next; })}
                aria-label="Recent updates"
              >
                <EstateIcon name="bell" />
                {unreadCount > 0 && <span className="edash-notif-badge">{Math.min(unreadCount, 9)}</span>}
              </button>
              {notifOpen && (
                <div className="edash-card" style={{ position: "absolute", right: 0, top: 44, width: 300, zIndex: 20 }}>
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
                </div>
              )}
            </div>
            <div style={{ position: "relative" }} ref={userMenuRef}>
              <div className="edash-user" onClick={() => setUserMenuOpen((value) => !value)}>
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
        <div className={`edash-body${activeKey === "map" ? " edash-body--fill" : ""}`}>{children}</div>
      </div>
      {showHelp && (
        <EstateModal title="Help & Support" subtitle="We usually reply within one business day." onClose={() => setShowHelp(false)}>
          <p className="edash-status-row-desc" style={{ marginBottom: 14 }}>
            Stuck on something, found a bug, or want a hand setting up an Estate? Email us and include your organization name and, if relevant, the plot or estate you're working on.
          </p>
          <a className="edash-btn-primary" style={{ display: "inline-flex", marginBottom: 8 }} href="mailto:landchecktech@gmail.com?subject=LandCheck%20Estates%20Support">
            <EstateIcon name="mail" /> Email landchecktech@gmail.com
          </a>
          <p className="edash-field-note">
            For hazard or geometry questions, the Audit Timeline and Reports pages often have the detail our team will ask for first.
          </p>
        </EstateModal>
      )}
    </div>
  );
}
