import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, extractApiErrorMessage } from "../api/client";
import "../styles/estate-portal.css";
import "../styles/estate-auth.css";

export default function EstateForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/estates/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(await extractApiErrorMessage(err, "Something went wrong. Please try again."));
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
          <h1>Reset your password</h1>
          {sent ? (
            <p>If an account exists for <strong>{email}</strong>, we've sent a link to reset your password. It expires in 1 hour.</p>
          ) : (
            <>
              <p>Enter your company email and we'll send you a link to reset your password.</p>
              <form onSubmit={submit}>
                <label>
                  Company email
                  <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </label>
                {error && <div className="estate-auth-error" role="alert">{error}</div>}
                <button className="estate-button" type="submit" disabled={busy}>{busy ? "Sending..." : "Send reset link"}</button>
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
