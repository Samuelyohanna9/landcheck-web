import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { getEstateAuthSession, changeEstatePassword } from "../auth/estateAuth";
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

export default function EstateSetNewPassword() {
  const navigate = useNavigate();
  const session = getEstateAuthSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!session) return <Navigate to="/estates/login" replace />;
  if (!session.user.must_change_password) return <Navigate to="/estates/workspace" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      await changeEstatePassword(currentPassword, password);
      navigate("/estates/workspace", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Password could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="estate-auth-page">
      <div className="estate-auth-shell">
        <span className="estate-auth-brand" aria-label="LandCheck Estates">
          <span className="estate-auth-brand-logo"><img src="/logo-icon-192.png" alt="LandCheck" width="40" height="40" /></span>
          <span className="estate-auth-brand-tag">Estates</span>
        </span>
        <div className="estate-auth-card">
          <p className="estate-kicker">Welcome, {session.user.full_name.split(" ")[0]}</p>
          <h1>Set your own password</h1>
          <p>You signed in with a temporary password. Choose your own before continuing to the dashboard.</p>
          <form onSubmit={submit}>
            <label>
              Temporary password
              <div className="estate-password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>
            </label>
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
            <label>
              Confirm new password
              <div className="estate-password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
            </label>
            {error && <div className="estate-auth-error" role="alert">{error}</div>}
            <button className="estate-button" type="submit" disabled={busy}>{busy ? "Saving..." : "Save password & continue"}</button>
          </form>
          <p className="estate-auth-switch">Wrong account? <Link to="/estates/login">Sign in again</Link></p>
        </div>
      </div>
    </main>
  );
}
