import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingPopoverPosition } from "../utils/useFloatingPopoverPosition";
import "../styles/profile-avatar-menu.css";

type Props = {
  email: string;
  fullName?: string | null;
  credits?: number | null;
  role?: string | null;
  organizationName?: string | null;
  planName?: string | null;
  workspaceName?: string | null;
  workspaceOptions?: string[];
  onWorkspaceChange?: (workspace: string) => void;
  onContactSupport?: () => void;
  onSystemStatus?: () => void;
  onTopUp?: () => void;
  onSignOut: () => void;
};

type ThemeMode = "dark" | "light";

const PROFILE_THEME_STORAGE_KEY = "landcheck_workspace_theme";

const getInitials = (fullName: string | null | undefined, email: string) => {
  const name = (fullName || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (email.trim()[0] || "?").toUpperCase();
};

export default function ProfileAvatarMenu({
  email,
  fullName,
  credits,
  role,
  organizationName,
  planName,
  workspaceName,
  workspaceOptions,
  onWorkspaceChange,
  onContactSupport,
  onSystemStatus,
  onTopUp,
  onSignOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    return window.localStorage.getItem(PROFILE_THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const position = useFloatingPopoverPosition(triggerRef, popoverRef, open);
  const initials = getInitials(fullName, email);
  const displayName = (fullName || "").trim() || email;
  const roleLabel = (role || "Surveyor").trim() || "Surveyor";
  const organizationLabel = (organizationName || "LandCheck Survey").trim() || "LandCheck Survey";
  const planLabel = (planName || "Workspace plan").trim() || "Workspace plan";
  const workspaceChoices = Array.from(new Set([
    (workspaceName || organizationLabel).trim() || "LandCheck Survey",
    ...(workspaceOptions || []).map((option) => option.trim()).filter(Boolean),
  ]));
  const [selectedWorkspace, setSelectedWorkspace] = useState(workspaceChoices[0]);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.dataset.workspaceTheme = theme;
    if (typeof window !== "undefined") window.localStorage.setItem(PROFILE_THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    setSettingsOpen(false);
  };

  const handleWorkspaceChange = (workspace: string) => {
    setSelectedWorkspace(workspace);
    onWorkspaceChange?.(workspace);
  };

  return (
    <div className="profile-avatar-menu" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="profile-avatar-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {initials}
      </button>
      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              className="profile-avatar-popover"
              style={{ top: position.top, left: position.left }}
            >
              <div className="profile-avatar-popover-header">
                <div className="profile-avatar-popover-avatar">{initials}</div>
                <div className="profile-avatar-popover-identity">
                  <span className="profile-avatar-popover-name">{displayName}</span>
                  <span className="profile-avatar-popover-email">{email}</span>
                  <span className="profile-avatar-popover-context">{roleLabel} <span aria-hidden="true">&#8226;</span> {planLabel}</span>
                  <span className="profile-avatar-popover-organization">{organizationLabel}</span>
                </div>
              </div>
              {settingsOpen ? (
                <div className="profile-avatar-settings-panel">
                  <button type="button" className="profile-avatar-settings-back" onClick={() => setSettingsOpen(false)}>
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M12.5 4 6.5 10l6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Profile Settings
                  </button>
                  <div className="profile-avatar-detail-row"><span>Full name</span><strong>{displayName}</strong></div>
                  <div className="profile-avatar-detail-row"><span>Email</span><strong>{email}</strong></div>
                  <p>Contact support to update your personal details or request a password reset.</p>
                  <button type="button" className="profile-avatar-secondary-btn" onClick={() => { closeMenu(); onContactSupport?.(); }}>
                    Contact support
                  </button>
                </div>
              ) : (
                <>
                  <div className="profile-avatar-menu-section profile-avatar-workspace-section">
                    <span className="profile-avatar-menu-label">Workspace</span>
                    <div className="profile-avatar-workspace-control">
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M3.5 6.5h13v10h-13zM6 6.5V4h8v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                      </svg>
                      <select value={selectedWorkspace} onChange={(event) => handleWorkspaceChange(event.target.value)} aria-label="Switch workspace">
                        {workspaceChoices.map((workspace) => <option key={workspace} value={workspace}>{workspace}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="profile-avatar-menu-section profile-avatar-credits-card">
                    <div className="profile-avatar-section-heading">
                      <span>Survey credits</span>
                      <span className={`profile-avatar-credits-badge${credits == null ? " is-unavailable" : ""}`} aria-live="polite">
                        {credits == null ? "Balance unavailable" : `${credits.toLocaleString()} remaining`}
                      </span>
                    </div>
                    <div className="profile-avatar-credits-footer">
                      <span>{credits == null ? "Usage data will appear when billing is connected." : "Available for new survey work."}</span>
                      <button type="button" onClick={() => { closeMenu(); onTopUp?.(); }}>Top up</button>
                    </div>
                  </div>

                  <div className="profile-avatar-menu-links profile-avatar-menu-section">
                    <button type="button" className="profile-avatar-menu-link" onClick={() => setSettingsOpen(true)}>
                      <span className="profile-avatar-menu-link-icon"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" /><path d="M4.5 16c.8-2.3 2.6-3.5 5.5-3.5s4.7 1.2 5.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg></span>
                      <span>Profile Settings</span><span className="profile-avatar-menu-link-arrow" aria-hidden="true">&#8250;</span>
                    </button>
                    <a className="profile-avatar-menu-link" href="/survey">
                      <span className="profile-avatar-menu-link-icon"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 4.5h12v11H4zM7 8h6M7 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                      <span>Documentation &amp; Guides</span><span className="profile-avatar-menu-link-arrow" aria-hidden="true">&#8250;</span>
                    </a>
                  </div>

                  <div className="profile-avatar-menu-section profile-avatar-appearance">
                    <div>
                      <span className="profile-avatar-menu-label">Appearance</span>
                      <strong>{theme === "dark" ? "Dark mode" : "Light mode"}</strong>
                    </div>
                    <button
                      type="button"
                      className="profile-avatar-theme-toggle"
                      role="switch"
                      aria-checked={theme === "light"}
                      aria-label="Toggle light and dark mode"
                      onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
                    >
                      <span />
                    </button>
                  </div>

                  <div className="profile-avatar-menu-links profile-avatar-menu-section profile-avatar-support-links">
                    <button type="button" className="profile-avatar-menu-link" onClick={() => { closeMenu(); onContactSupport?.(); }}>
                      <span className="profile-avatar-menu-link-icon"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3.5 5.5h13v8h-7l-3.5 3v-3h-2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg></span>
                      <span>Contact Support</span><span className="profile-avatar-menu-link-arrow" aria-hidden="true">&#8250;</span>
                    </button>
                    <button type="button" className="profile-avatar-menu-link" onClick={() => { closeMenu(); onSystemStatus?.(); }}>
                      <span className="profile-avatar-menu-link-icon"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.4" /><path d="M10 6.5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg></span>
                      <span>System Status</span><span className="profile-avatar-menu-link-arrow" aria-hidden="true">&#8250;</span>
                    </button>
                  </div>

                  <button type="button" className="profile-avatar-signout-btn" onClick={() => { closeMenu(); onSignOut(); }}>
                    Sign out
                  </button>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
