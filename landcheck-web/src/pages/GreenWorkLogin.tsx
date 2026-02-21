import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isWorkAuthed, setWorkAuthed, validateWorkLogin } from "../auth/workAuth";
import "../styles/green-work-login.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

export default function GreenWorkLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const redirectTo = useMemo(() => {
    const state = (location.state || {}) as { from?: string };
    return state.from || "/green-work";
  }, [location.state]);

  useEffect(() => {
    if (!isWorkAuthed()) return;
    navigate("/green-work", { replace: true });
  }, [navigate]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!validateWorkLogin(username, password)) {
      setError("Invalid username or password.");
      return;
    }
    setWorkAuthed();
    setError("");
    navigate(redirectTo, { replace: true });
  };

  return (
    <div className="work-login-page">
      <div className="work-login-card">
        <div className="work-login-brand">
          <img src={GREEN_LOGO_SRC} alt="LandCheck Green" />
          <h1>LandCheck Work</h1>
        </div>
        <p className="work-login-subtitle">Operations dashboard login</p>
        <form className="work-login-form" onSubmit={onSubmit}>
          <label htmlFor="work-login-username">Username</label>
          <input
            id="work-login-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
          />

          <label htmlFor="work-login-password">Password</label>
          <input
            id="work-login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
          />

          {error && <p className="work-login-error">{error}</p>}

          <button type="submit">Login</button>
        </form>
      </div>
    </div>
  );
}
