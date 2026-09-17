import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/csv-preview-modal.css";
import "../styles/signup-gate-modal.css";
import OtpBoxInput from "./OtpBoxInput";
import {
  claimDraftHazardJobs,
  claimDraftSurveyPlots,
  hasPendingSurveyDownload,
  requestSurveyMagicLink,
  setPendingSurveyDownload,
  startSurveyGoogleSignIn,
  verifySurveyOtp,
  type PendingSurveyDownload,
} from "../auth/surveyAuth";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  // Exactly which download/export triggered the gate, so the page that eventually completes
  // sign-in (which may be a different browser tab) can replay the same action for real. Omitted
  // for a plain "sign in" entry point (e.g. the nav bar) that isn't resuming anything - the auth
  // pages fall back to sending the user to /dashboard in that case.
  pendingDownload?: PendingSurveyDownload;
  // The four props below let a second caller (Hazard Analysis, gating a 2nd anonymous analysis
  // run rather than a download) reuse this exact modal with its own copy/resume target, without
  // touching Survey Plan's own default behavior at all - every one of them is optional and
  // Survey Plan passes none of them.
  hasPendingAction?: boolean;
  onBeforeAuth?: () => void;
  readyTitle?: string;
  readyIntro?: string;
  resumePath?: string;
};

export default function SignupGateModal({
  isOpen, onClose, pendingDownload, hasPendingAction, onBeforeAuth, readyTitle, readyIntro, resumePath,
}: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isReady = hasPendingAction ?? Boolean(pendingDownload);

  const handleGoogle = () => {
    if (pendingDownload) setPendingSurveyDownload(pendingDownload);
    onBeforeAuth?.();
    startSurveyGoogleSignIn();
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setSending(true);
    try {
      if (pendingDownload) setPendingSurveyDownload(pendingDownload);
      onBeforeAuth?.();
      await requestSurveyMagicLink(cleanEmail);
      setSent(true);
    } catch {
      setError("Could not send the sign-in link. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const finishSignIn = async () => {
    await Promise.all([claimDraftSurveyPlots(), claimDraftHazardJobs()]);
    onClose();
    if (hasPendingAction != null) {
      navigate(hasPendingAction ? resumePath || "/dashboard" : "/dashboard");
      return;
    }
    navigate(hasPendingSurveyDownload() ? "/survey-plan?resume=1" : "/dashboard");
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setOtpError("Enter the 6-digit code.");
      return;
    }
    setOtpError(null);
    setVerifyingOtp(true);
    try {
      await verifySurveyOtp(email, otp);
      await finishSignIn();
    } catch {
      setOtpError("That code is invalid or has expired.");
      setOtp("");
    } finally {
      setVerifyingOtp(false);
    }
  };

  return (
    <div className="csv-modal-overlay" onClick={onClose}>
      <div className="csv-modal signup-gate-modal" onClick={(e) => e.stopPropagation()}>
        <div className="csv-modal-header">
          <h3>{isReady ? readyTitle || "Your survey plan is ready" : "Sign in to LandCheck Survey"}</h3>
          <button className="csv-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="csv-modal-body">
          {sent ? (
            <div className="signup-gate-sent">
              <p>
                We sent a link and a 6-digit code to <strong>{email.trim()}</strong>. Click the link, or enter the
                code below
                {isReady ? " — either one picks up right where you left off." : "."} Don't see it? Check your spam
                or junk folder.
              </p>

              <form className="otp-form" onSubmit={handleOtpSubmit}>
                <OtpBoxInput value={otp} onChange={setOtp} disabled={verifyingOtp} autoFocus />
                {otpError && <div className="csv-error">{otpError}</div>}
                <button type="submit" className="signup-gate-email-btn" disabled={verifyingOtp || otp.length !== 6}>
                  {verifyingOtp ? "Verifying..." : "Verify code"}
                </button>
              </form>
            </div>
          ) : (
            <>
              <p className="signup-gate-intro">
                {isReady
                  ? readyIntro || "Create a free account to download and keep your project. No long forms — just continue with Google or email."
                  : "Sign in to see your saved projects. No long forms — just continue with Google or email."}
              </p>

              <button type="button" className="signup-gate-google-btn" onClick={handleGoogle}>
                Continue with Google
              </button>

              <div className="signup-gate-divider">
                <span>or</span>
              </div>

              <form className="signup-gate-email-form" onSubmit={handleEmailSubmit}>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={sending}
                />
                <button type="submit" className="signup-gate-email-btn" disabled={sending}>
                  {sending ? "Sending..." : "Continue with Email"}
                </button>
              </form>
              {error && <div className="csv-error">{error}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
