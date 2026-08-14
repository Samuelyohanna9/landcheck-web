import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingPopoverPosition } from "../utils/useFloatingPopoverPosition";
import "../styles/profile-avatar-menu.css";

type Props = {
  email: string;
  fullName?: string | null;
  // undefined/null = credits aren't live yet, show "Coming soon" rather than a fake 0 -
  // pass a real number once a credits balance endpoint exists.
  credits?: number | null;
  onSignOut: () => void;
};

const getInitials = (fullName: string | null | undefined, email: string) => {
  const name = (fullName || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (email.trim()[0] || "?").toUpperCase();
};

export default function ProfileAvatarMenu({ email, fullName, credits, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const position = useFloatingPopoverPosition(triggerRef, popoverRef, open);
  const initials = getInitials(fullName, email);
  const displayName = (fullName || "").trim() || email;

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
                  {fullName && <span className="profile-avatar-popover-email">{email}</span>}
                </div>
              </div>
              <div className="profile-avatar-popover-row">
                <span>Credits</span>
                <span className="profile-avatar-popover-credits">
                  {credits == null ? "Coming soon" : credits}
                </span>
              </div>
              <button type="button" className="profile-avatar-signout-btn" onClick={onSignOut}>
                Sign out
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
