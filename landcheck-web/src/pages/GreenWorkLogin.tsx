import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isWorkAuthed, loginWork } from "../auth/workAuth";
import "../styles/green-work-login.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";
const DASHBOARD_PREVIEW_SRC = "/Screenshot lndcheck work.png";

const proofPoints = [
  {
    title: "Verified implementation",
    detail: "GPS-tagged tree records, field evidence, and supervisor review in one workspace.",
  },
  {
    title: "CSR reporting ready",
    detail: "Prepare board-ready summaries, implementation history, and programme exports faster.",
  },
  {
    title: "Operations control",
    detail: "Manage agents, planting orders, field visits, and review queues without switching tools.",
  },
];

const miniStats = [
  { value: "GPS", label: "evidence-first workflow" },
  { value: "Live", label: "assignment visibility" },
  { value: "PDF", label: "reporting outputs" },
];

export default function GreenWorkLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectTo = useMemo(() => {
    const state = (location.state || {}) as { from?: string };
    return state.from || "/green-work";
  }, [location.state]);

  useEffect(() => {
    if (!isWorkAuthed()) return;
    navigate("/green-work", { replace: true });
  }, [navigate]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await loginWork({
        username,
        password,
        organization_id: null,
      });
      setError("");
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="work-login-page">
      <div className="work-login-shell">
        <section className="work-login-showcase" aria-label="LandCheck Work platform overview">
          <div className="work-login-showcase-copy">
            <span className="work-login-eyebrow">LandCheck Work</span>
            <h1>Secure delivery control for partner organisations and CSR programmes.</h1>
            <p className="work-login-lead">
              Run implementation orders, field visits, evidence review, and stakeholder reporting from one premium
              operations workspace.
            </p>
          </div>

          <div className="work-login-proof-grid">
            {proofPoints.map((item) => (
              <article key={item.title} className="work-login-proof-card">
                <div className="work-login-proof-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                    <path
                      d="M12 3l7 3v5c0 5.2-3.3 9.2-7 10-3.7-.8-7-4.8-7-10V6l7-3z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 12l2 2 4-4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.detail}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="work-login-preview">
            <div className="work-login-preview-head">
              <span className="work-login-preview-badge">Operations dashboard preview</span>
              <a href="/green-partners">See corporate overview</a>
            </div>
            <img
              src={DASHBOARD_PREVIEW_SRC}
              alt="LandCheck Work dashboard preview"
              width="1280"
              height="720"
              loading="lazy"
            />
          </div>

          <div className="work-login-mini-stats">
            {miniStats.map((item) => (
              <div key={item.value} className="work-login-mini-stat">
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="work-login-panel">
          <div className="work-login-panel-head">
            <div className="work-login-brand-lockup">
              <div className="work-login-brand-logo">
                <img src={GREEN_LOGO_SRC} alt="LandCheck Green" width="70" height="70" />
              </div>
              <div>
                <span className="work-login-panel-badge">Secure workspace</span>
                <h2>Sign in to LandCheck Work</h2>
                <p>For operations teams, partner organisations, programme supervisors, and CSR clients.</p>
              </div>
            </div>
            <div className="work-login-panel-note">
              By using LandCheck Work, you agree to process operational and contact records only when authorized.
              <a className="work-login-inline-link" href="/privacy">
                Privacy policy
              </a>
            </div>
          </div>

          <form className="work-login-form" onSubmit={onSubmit}>
            <label htmlFor="work-login-username">Username</label>
            <input
              id="work-login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your work username"
              autoComplete="username"
            />

            <label htmlFor="work-login-password">Password</label>
            <div className="work-login-password-wrap">
              <input
                id="work-login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="work-login-password-eye"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {error ? <p className="work-login-error">{error}</p> : null}

            <button type="submit" className="work-login-submit" disabled={loading}>
              {loading ? "Logging in..." : "Open dashboard"}
            </button>
          </form>

          <div className="work-login-footer">
            <a href="/green-partners">Explore LC Green Corporate</a>
            <a href="mailto:landchecktech@gmail.com?subject=LandCheck%20Work%20Access">
              Request organisation access
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
