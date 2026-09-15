import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { extractApiErrorMessage } from "../api/client";
import { loginEstate } from "../auth/estateAuth";
import "../styles/estate-portal.css";

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      {off && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

export default function EstateLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const from = String((location.state as { from?: string } | null)?.from || "/estates/workspace");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await loginEstate(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(await extractApiErrorMessage(err, "Sign-in failed. Check your email and password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="estate-auth-page">
      <div className="estate-auth-shell">
        <Link to="/estates" className="estate-auth-brand" aria-label="LandCheck Estates home">
          <span className="estate-auth-brand-logo"><img src="/logo.svg" alt="LandCheck" width="520" height="140" /></span>
          <span className="estate-auth-brand-tag">Estates</span>
        </Link>
        <div className="estate-auth-card">
          <p className="estate-kicker">Company workspace</p>
          <h1>Sign in to Estates</h1>
          <p>Manage your land register, buyers and delivery workflow from one workspace.</p>
          <form onSubmit={submit}>
            <label>
              Company email
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Password
              <div className="estate-password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="estate-password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </label>
            <Link to="/estates/forgot-password" className="estate-text-link" style={{ justifySelf: "start" }}>Forgot password?</Link>
            {error && <div className="estate-auth-error" role="alert">{error}</div>}
            <button className="estate-button" type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
          </form>
          <p className="estate-auth-trust">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.6" /></svg>
            Secure, encrypted connection
          </p>
          <p className="estate-auth-switch">New to LandCheck Estates? <Link to="/estates/register">Register your company</Link></p>
        </div>
        <Link to="/" className="estate-auth-back">Return to LandCheck</Link>
      </div>
    </main>
  );
}
