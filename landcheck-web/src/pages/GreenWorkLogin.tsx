import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isWorkAuthed, loginWork } from "../auth/workAuth";
import GreenLoadingAnimation from "../components/GreenLoadingAnimation";
import "../styles/green-work-login.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";
const REMEMBERED_USERNAME_KEY = "work-login-remembered-username";

// Land-parcel/cadastral backdrop - LandCheck's own product vocabulary (plot boundaries, a
// watercourse, surveyed point markers) rather than generic stock texture. One large scene that
// scales to fill the viewport ("xMidYMid slice"), not a small repeating tile.
function WorkLoginBackdropArt() {
  const parcels = [
    "M -40,120 L 220,60 L 310,190 L 140,280 L -60,240 Z",
    "M 220,60 L 470,10 L 560,150 L 310,190 Z",
    "M -60,240 L 140,280 L 120,470 L -90,470 Z",
    "M 140,280 L 310,190 L 430,330 L 330,470 L 120,470 Z",
    "M 470,10 L 760,-20 L 830,130 L 560,150 Z",
    "M 560,150 L 830,130 L 880,300 L 620,340 L 430,330 L 310,190 Z",
    "M 620,340 L 880,300 L 940,470 L 690,470 L 330,470 L 430,330 Z",
    "M 830,130 L 1080,90 L 1150,240 L 940,300 L 880,300 Z",
    "M 940,300 L 1150,240 L 1220,430 L 940,470 Z",
    "M 1080,90 L 1330,60 L 1400,210 L 1150,240 Z",
    "M 1150,240 L 1400,210 L 1460,400 L 1220,430 Z",
    "M -90,470 L 120,470 L 100,620 L -100,650 Z",
    "M 120,470 L 330,470 L 300,650 L 100,620 Z",
    "M 330,470 L 690,470 L 660,660 L 300,650 Z",
    "M 690,470 L 940,470 L 920,650 L 660,660 Z",
    "M 940,470 L 1220,430 L 1240,630 L 920,650 Z",
  ];
  const pins = [
    [150, 330],
    [700, 90],
    [1240, 330],
    [220, 560],
    [1330, 560],
    [860, 420],
    [430, 40],
    [1030, 560],
  ];

  return (
    <svg
      className="work-login-backdrop-art"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
    >
      <g className="work-login-art-parcels" fill="none" strokeWidth="1.4">
        {parcels.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path
        className="work-login-art-river"
        d="M -40,520 C 160,480 220,560 360,540 C 520,516 560,610 720,600 C 900,588 940,500 1120,520 C 1280,538 1340,470 1480,460"
        fill="none"
        strokeWidth="3"
      />
      <g className="work-login-art-pins">
        {pins.map(([x, y]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
            <path d="M0 0c-7 0-13 5.6-13 12.5C-13 22 0 34 0 34s13-12 13-21.5C13 5.6 7 0 0 0z" />
            <circle cx="0" cy="12" r="4.2" fill="#04140b" />
          </g>
        ))}
      </g>
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.3 4.3M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export default function GreenWorkLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectTo = useMemo(() => {
    const state = (location.state || {}) as { from?: string };
    return state.from || "/green-work";
  }, [location.state]);

  useEffect(() => {
    if (isWorkAuthed()) {
      navigate("/green-work", { replace: true });
      return;
    }
    const remembered = window.localStorage.getItem(REMEMBERED_USERNAME_KEY);
    if (remembered) {
      setUsername(remembered);
      setRememberMe(true);
    }
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
      if (rememberMe) {
        window.localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
      } else {
        window.localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      }
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
      <div className="work-login-backdrop" aria-hidden="true">
        <WorkLoginBackdropArt />
        <div className="work-login-backdrop-scrim" />
      </div>

      <div className="work-login-shell">
        <div className="work-login-brand">
          <img src={GREEN_LOGO_SRC} alt="LandCheck Green" width="34" height="34" />
          <span>LandCheck Work</span>
        </div>

        <section className="work-login-card">
          <span className="work-login-card-kicker">Secure organisation portal</span>
          <h1>Welcome back</h1>
          <p className="work-login-card-sub">Sign in to continue to your workspace.</p>

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
                <EyeIcon open={showPassword} />
              </button>
            </div>

            <div className="work-login-row">
              <label className="work-login-checkbox">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>
              <a
                className="work-login-forgot"
                href="mailto:landchecktech@gmail.com?subject=LandCheck%20Work%20Password%20Reset"
              >
                Forgot password?
              </a>
            </div>

            {error ? <p className="work-login-error">{error}</p> : null}

            <button type="submit" className="work-login-submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
            {loading && <GreenLoadingAnimation size="small" className="work-login-loading" />}
          </form>

          <div className="work-login-divider">
            <span>New to LandCheck?</span>
          </div>

          <a
            className="work-login-outline-btn"
            href="mailto:landchecktech@gmail.com?subject=LandCheck%20Work%20Access"
          >
            Request organisation access
          </a>

          <a className="work-login-explore" href="/green-partners">
            Explore LC Green Platform
          </a>
        </section>

        <p className="work-login-footer">LandCheck Work by LandCheck Green</p>
      </div>
    </div>
  );
}
