import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getGreenAuthSession, clearGreenAuthed } from "../auth/greenAuth";
import { clearWorkAuthed, getWorkAuthSession } from "../auth/workAuth";
import { logSecurityEvent } from "../utils/securityLogger";

interface SessionTimeoutGateProps {
  children: ReactNode;
  timeoutMs?: number; // Defaults to 15 minutes (900,000 ms)
}

/**
 * Enforces session timeout on inactivity to comply with SOC 2 CC6.1 & CC6.2.
 * Monitors interaction, logs the user out upon expiration, and creates an audit log.
 */
export default function SessionTimeoutGate({
  children,
  timeoutMs = 15 * 60 * 1000, // 15 minutes
}: SessionTimeoutGateProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const timerRef = useRef<number | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  // Check if any admin, green-work, or green-sponsor session is active
  const hasActiveSession = (): boolean => {
    if (typeof window === "undefined") return false;
    const greenSession = getGreenAuthSession();
    const workSession = getWorkAuthSession();
    return Boolean(greenSession || workSession);
  };

  const getActiveUserIdentifier = (): string => {
    if (typeof window === "undefined") return "Guest";
    const greenSession = getGreenAuthSession();
    if (greenSession?.user?.full_name) return greenSession.user.full_name;
    const workSession = getWorkAuthSession();
    if (workSession?.user?.full_name) return workSession.user.full_name;
    if (workSession) return "Green Work Officer";
    return "Guest";
  };

  const handleLogout = () => {
    if (!hasActiveSession()) return;

    const username = getActiveUserIdentifier();
    
    // Clear all auth sessions
    clearGreenAuthed();
    clearWorkAuthed();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("landcheck_green_active_user");
      window.localStorage.removeItem("landcheck_green_active_section");
      window.localStorage.removeItem("landcheck_green_active_project_id");
    }

    logSecurityEvent(
      username,
      "session_timeout",
      "info",
      "Session automatically signed out due to 15 minutes of inactivity (SOC 2 Compliance)."
    );

    setShowWarning(true);
    
    // Redirect to login or home
    if (location.pathname.startsWith("/green-work")) {
      navigate("/green-work/login", { replace: true });
    } else if (location.pathname.startsWith("/green-merchant")) {
      navigate("/green-merchant/login", { replace: true });
    } else if (location.pathname.startsWith("/admin")) {
      navigate("/green/login", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  };

  const resetTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    
    if (hasActiveSession()) {
      timerRef.current = window.setTimeout(handleLogout, timeoutMs);
    }
  };

  useEffect(() => {
    // List of events indicating user activity
    const activityEvents = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    const handler = () => resetTimer();

    // Start timer on mount or location changes
    resetTimer();

    activityEvents.forEach((event) => {
      window.addEventListener(event, handler, { passive: true });
    });

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handler);
      });
    };
  }, [location.pathname]); // Re-run when navigation happens

  return (
    <>
      {children}

      {showWarning && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            background: "#1e293b",
            color: "#ffffff",
            padding: "16px 20px",
            borderRadius: 12,
            boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
            border: "1px solid #ef4444",
            maxWidth: 340,
            animation: "slideIn 0.3s ease-out",
          }}
          role="alert"
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20 }}>🔒</span>
            <div>
              <strong style={{ display: "block", marginBottom: 4, color: "#f87171" }}>
                Session Timed Out
              </strong>
              <span style={{ fontSize: "0.82rem", opacity: 0.9, lineHeight: 1.4 }}>
                You have been signed out due to 15 minutes of inactivitzy. Please log in again to continue using the application.
              </span>
              <button
                type="button"
                onClick={() => setShowWarning(false)}
                style={{
                  display: "block",
                  marginTop: 10,
                  background: "none",
                  border: "none",
                  color: "#38bdf8",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
