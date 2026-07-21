import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isWorkAuthed, loginWork } from "../auth/workAuth";
import "../styles/green-work-login.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

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
      <div className="work-login-watermark" aria-hidden="true">
        <img src={GREEN_LOGO_SRC} alt="" width="320" height="320" />
      </div>
      <div className="work-login-accent" aria-hidden="true">
        <div className="work-login-accent-halo" />
        <div className="work-login-accent-panel" />
      </div>

      <div className="work-login-top-badge">LandCheck Work</div>

      <div className="work-login-shell">
        <div className="work-login-brandmark" aria-hidden="true">
          <img src={GREEN_LOGO_SRC} alt="" width="180" height="180" />
        </div>

        <section className="work-login-card">
          <div className="work-login-card-head">
            <span className="work-login-card-kicker">Authorised access</span>
            <h1>Login to your account</h1>
            <p>
              Sign in to manage field programmes, sponsor-linked operations, evidence review, and CSR reporting.
            </p>
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
              {loading ? "Signing in..." : "Login"}
            </button>
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
    </div>
  );
}
