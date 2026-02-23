import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isGreenAuthed, loginGreen } from "../auth/greenAuth";
import "../styles/green-work-login.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

export default function GreenLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectTo = useMemo(() => {
    const state = (location.state || {}) as { from?: string };
    return state.from || "/green";
  }, [location.state]);

  useEffect(() => {
    if (!isGreenAuthed()) return;
    navigate("/green", { replace: true });
  }, [navigate]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await loginGreen({
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
      <div className="work-login-card">
        <div className="work-login-brand">
          <div className="work-login-brand-logos">
            <img src={GREEN_LOGO_SRC} alt="LandCheck Green" />
          </div>
          <h1>LandCheck Green</h1>
        </div>
        <p className="work-login-subtitle">Field monitoring app login</p>
        <form className="work-login-form" onSubmit={onSubmit}>
          <label htmlFor="green-login-username">Username</label>
          <input
            id="green-login-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
          />

          <label htmlFor="green-login-password">Password</label>
          <div className="work-login-password-wrap">
            <input
              id="green-login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
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

          {error && <p className="work-login-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
