import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import EstateIcon, { type EstateIconName } from "./EstateIcon";
import { clearEstateAuthSession, getEstateAuthSession } from "../../auth/estateAuth";
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
  children,
}: {
  estateId: string;
  estateName?: string;
  activeKey: EstateNavKey;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  recentActivity?: Array<{ id: number | string; action: string; created_at: string }>;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const estateSession = getEstateAuthSession();
  const activeItem = estateNavItems.find((item) => item.key === activeKey);

  return (
    <div className={`edash${sidebarOpen ? " is-sidebar-open" : ""}`}>
      <aside className="edash-sidebar">
        <div className="edash-sidebar-brand">
          <span className="edash-sidebar-brand-mark"><EstateIcon name="house" /></span>
          <div>
            <strong>LandCheck</strong>
            <small>Estates</small>
          </div>
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
        <div className="edash-sidebar-footer">
          <EstateIcon name="help" />
          Help &amp; Support
        </div>
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
            <div style={{ position: "relative" }}>
              <button type="button" className="edash-icon-btn" onClick={() => setNotifOpen((value) => !value)} aria-label="Recent updates">
                <EstateIcon name="bell" />
                {recentActivity.length > 0 && <span className="edash-notif-badge">{Math.min(recentActivity.length, 9)}</span>}
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
                  </div>
                </div>
              )}
            </div>
            <div style={{ position: "relative" }}>
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
    </div>
  );
}
