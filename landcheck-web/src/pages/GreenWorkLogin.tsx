import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isWorkAuthed, loginWork } from "../auth/workAuth";
import "../styles/green-work-login.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

const accessScopes = [
  "Organisation operations",
  "Public sponsor administration",
  "CSR reporting and delivery",
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
        <section className="work-login-stage" aria-label="LandCheck Work access overview">
          <span className="work-login-eyebrow">LandCheck Work</span>
          <h1>Secure workspace for approved operational teams.</h1>
          <p className="work-login-stage-copy">
            Sign in to manage field programmes, sponsor-linked operations, evidence review, and premium reporting from
            one controlled workspace.
          </p>
          <div className="work-login-scope-row">
            {accessScopes.map((item) => (
              <span key={item} className="work-login-scope-chip">
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="work-login-panel">
          <div className="work-login-panel-head">
            <div className="work-login-brand-lockup">
              <div className="work-login-brand-logo">
                <img src={GREEN_LOGO_SRC} alt="LandCheck Green" width="68" height="68" />
              </div>
              <div>
                <span className="work-login-panel-badge">Authorised access</span>
                <h2>Sign in to LandCheck Work</h2>
                <p>For project admins, organisation teams, sponsor operations staff, and CSR managers.</p>
              </div>
            </div>
            <div className="work-login-panel-note">
              Use this workspace only if your organization or LandCheck admin has already granted access.
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
              {loading ? "Signing in..." : "Open dashboard"}
            </button>
          </form>
        </section>

        <section className="work-login-links" aria-label="Work login support links">
          <a className="work-login-link-card" href="/green-partners">
            <strong>Explore LC Green Platform</strong>
            <span>See organisation, CSR, and public sponsorship routes before you enter the workspace.</span>
          </a>
          <a
            className="work-login-link-card"
            href="mailto:landchecktech@gmail.com?subject=LandCheck%20Work%20Access"
          >
            <strong>Request organisation access</strong>
            <span>Contact LandCheck if your team needs onboarding, support, or a new workspace invitation.</span>
          </a>
        </section>
      </div>
    </div>
  );
}
