import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { claimDraftSurveyPlots, hasPendingSurveyDownload, exchangeSurveyGoogleCode } from "../auth/surveyAuth";
import "../styles/signup-gate-modal.css";

export default function SurveyAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "error">("working");
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;
    const code = searchParams.get("code") || "";
    if (!code) {
      setStatus("error");
      return;
    }
    (async () => {
      try {
        await exchangeSurveyGoogleCode(code);
        await claimDraftSurveyPlots();
        navigate(hasPendingSurveyDownload() ? "/survey-plan?resume=1" : "/dashboard", { replace: true });
      } catch {
        setStatus("error");
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="csv-modal-overlay" style={{ position: "static", minHeight: "100dvh" }}>
      <div className="csv-modal signup-gate-modal">
        <div className="csv-modal-header">
          <h3>{status === "working" ? "Signing you in…" : "Sign-in failed"}</h3>
        </div>
        <div className="csv-modal-body">
          {status === "working" ? (
            <p className="signup-gate-intro">One moment while we finish signing you in with Google.</p>
          ) : (
            <p className="signup-gate-intro">Something went wrong signing you in. Please try again.</p>
          )}
        </div>
      </div>
    </div>
  );
}
