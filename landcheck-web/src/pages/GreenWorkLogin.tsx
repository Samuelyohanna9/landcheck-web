import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isWorkAuthed, loginWork } from "../auth/workAuth";
import GreenLoadingAnimation from "../components/GreenLoadingAnimation";
import "../styles/green-work-login.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";
const PANEL_PHOTO_SRC = "/agent%20planting%201.jpg";

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

  const panelStyle = { "--work-login-panel-image": `url('${PANEL_PHOTO_SRC}')` } as CSSProperties;

  return (
    <div className="work-login-page">
      <aside className="work-login-panel" style={panelStyle} aria-hidden="true">
        <div className="work-login-panel-image" />
        <div className="work-login-panel-scrim" />
        <div className="work-login-panel-pattern" />

        <div className="work-login-panel-top">
          <img src={GREEN_LOGO_SRC} alt="" width="34" height="34" />
          <span>LandCheck Work</span>
        </div>

        <div className="work-login-panel-content">
          <h2>Field operations, evidence, and CSR reporting in one place</h2>
          <p>
            Built for programme teams, field agents, and sponsor-linked partners running verified
            environmental work on the ground.
          </p>
          <div className="work-login-panel-tags">
            <span>Field programmes</span>
            <span>Evidence review</span>
            <span>CSR reporting</span>
          </div>
        </div>
      </aside>

      <main className="work-login-main">
        <div className="work-login-shell">
          <div className="work-login-mobile-header">
            <img src={GREEN_LOGO_SRC} alt="LandCheck Green" width="32" height="32" />
            <span>LandCheck Work</span>
          </div>

          <section className="work-login-card">
            <span className="work-login-card-kicker">Authorised access</span>
            <h1>Login to your account</h1>
            <p className="work-login-card-sub">
              Sign in to manage field programmes, sponsor-linked operations, evidence review, and CSR reporting.
            </p>

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
                {loading ? "Signing in..." : "Login"}
              </button>
              {loading && <GreenLoadingAnimation size="small" className="work-login-loading" />}
            </form>

            <div className="work-login-actions">
              <a href="/green-partners">Explore LC Green Platform</a>
              <a href="mailto:landchecktech@gmail.com?subject=LandCheck%20Work%20Access">
                Request organisation access
              </a>
            </div>
          </section>

          <p className="work-login-footer">LandCheck Work by LandCheck Green</p>
        </div>
      </main>
    </div>
  );
}
