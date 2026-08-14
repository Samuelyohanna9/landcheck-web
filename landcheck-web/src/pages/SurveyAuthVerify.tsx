import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { claimSurveyPlots, hasPendingSurveyDownload, verifySurveyMagicLink } from "../auth/surveyAuth";
import "../styles/signup-gate-modal.css";

const PLOTS_STORAGE_KEY = "landcheck_plots";

const readDraftPlotIds = (): number[] => {
  try {
    const raw = localStorage.getItem(PLOTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { id?: number }[];
    return parsed.map((p) => Number(p.id)).filter((id) => Number.isFinite(id));
  } catch {
    return [];
  }
};

export default function SurveyAuthVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "error">("working");
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;
    const token = searchParams.get("token") || "";
    if (!token) {
      setStatus("error");
      return;
    }
    (async () => {
      try {
        await verifySurveyMagicLink(token);
        await claimSurveyPlots(readDraftPlotIds());
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
          <h3>{status === "working" ? "Signing you in…" : "Sign-in link expired"}</h3>
        </div>
        <div className="csv-modal-body">
          {status === "working" ? (
            <p className="signup-gate-intro">One moment while we verify your sign-in link.</p>
          ) : (
            <p className="signup-gate-intro">
              This link is invalid or has expired. Go back to your survey plan and request a new one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
