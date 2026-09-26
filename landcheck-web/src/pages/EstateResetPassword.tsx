import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../api/client";
import "../styles/estate-portal.css";
import "../styles/estate-auth.css";

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      {off && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

export default function EstateResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token) { setError("This reset link is missing its token. Request a new one."); return; }
    setBusy(true);
    try {
      await api.post("/estates/auth/reset-password", { token, new_password: password });
      setDone(true);
      window.setTimeout(() => navigate("/estates/login", { replace: true }), 2500);
    } catch (err) {
      setError(await extractApiErrorMessage(err, "This reset link is invalid or has expired."));
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
          <h1>Set a new password</h1>
          {done ? (
            <p>Your password has been updated. Redirecting you to sign in...</p>
          ) : (
            <>
              <p>Choose a new password for your account.</p>
              <form onSubmit={submit}>
                <label>
                  New password <small>8 characters minimum</small>
                  <div className="estate-password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      minLength={8}
                      autoComplete="new-password"
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
                {error && <div className="estate-auth-error" role="alert">{error}</div>}
                <button className="estate-button" type="submit" disabled={busy}>{busy ? "Saving..." : "Reset password"}</button>
              </form>
            </>
          )}
          <p className="estate-auth-switch">Remembered it? <Link to="/estates/login">Sign in</Link></p>
        </div>
        <Link to="/" className="estate-auth-back">Return to LandCheck</Link>
      </div>
    </main>
  );
}
