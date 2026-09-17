import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useFloatingPopoverPosition } from "../utils/useFloatingPopoverPosition";
import "../styles/profile-avatar-menu.css";

type Props = {
  email: string;
  fullName?: string | null;
  role?: string | null;
  organizationName?: string | null;
  planName?: string | null;
  onContactSupport?: () => void;
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
  role,
  organizationName,
  planName,
  onContactSupport,
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
  const planLabel = (planName || "Plan").trim() || "Plan";

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
                  <div className="profile-avatar-menu-section profile-avatar-credits-card">
                    <div className="profile-avatar-section-heading">
                      <span>Credits</span>
                      <span className="profile-avatar-credits-badge is-unavailable" aria-live="polite">Coming soon</span>
                    </div>
                    <p className="profile-avatar-credits-note">Credit tracking will be available in a future update.</p>
                  </div>

                  <div className="profile-avatar-menu-links profile-avatar-menu-section">
                    <button type="button" className="profile-avatar-menu-link" onClick={() => setSettingsOpen(true)}>
                      <span className="profile-avatar-menu-link-icon"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" /><path d="M4.5 16c.8-2.3 2.6-3.5 5.5-3.5s4.7 1.2 5.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg></span>
                      <span>Profile Settings</span><span className="profile-avatar-menu-link-arrow" aria-hidden="true">&#8250;</span>
                    </button>
                    <Link className="profile-avatar-menu-link" to="/survey/guides" onClick={closeMenu}>
                      <span className="profile-avatar-menu-link-icon"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 4.5h12v11H4zM7 8h6M7 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                      <span>Documentation &amp; Guides</span><span className="profile-avatar-menu-link-arrow" aria-hidden="true">&#8250;</span>
                    </Link>
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
