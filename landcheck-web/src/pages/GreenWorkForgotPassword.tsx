import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestWorkPasswordReset } from "../auth/workAuth";
import { WorkLoginBackdropArt } from "./GreenWorkLogin";
import "../styles/green-work-login.css";

const GREEN_LOGO_SRC = "/logo-icon-192.png";

export default function GreenWorkForgotPassword() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError("");
    setMessage("");
    try {
      // The backend always reports success either way (it never confirms or denies that an email
      // is registered) - this is deliberate, to stop the form being used to find out which emails
      // have accounts on this portal. Any error shown here is a real failure (e.g. the request
      // itself couldn't be sent), not "that email doesn't exist".
      const response = await requestWorkPasswordReset(email);
      setMessage(response);
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: unknown } }; message?: unknown };
      const detail = typeof errObj.response?.data?.detail === "string" ? errObj.response.data.detail : "";
      const msg = typeof errObj.message === "string" ? errObj.message : "";
      setError(detail || msg || "Unable to send reset email. Please try again.");
    } finally {
      setSending(false);
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
          <img src={GREEN_LOGO_SRC} alt="" width="34" height="34" />
          <span>
            <strong>LandCheck</strong>
            <small>Work</small>
          </span>
        </div>

        <section className="work-login-card">
          <span className="work-login-card-kicker">Secure organisation portal</span>
          <h1>Reset your password</h1>
          <p className="work-login-card-sub">Enter the email on your work account and we'll send a secure link to set a new password.</p>

          {message ? (
            <p className="work-login-reset-success">{message}</p>
          ) : (
            <form className="work-login-form" onSubmit={onSubmit} aria-busy={sending}>
              <label htmlFor="work-forgot-email">Account email</label>
              <input
                id="work-forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@organisation.com"
                autoComplete="email"
                required
              />
              {error ? <p className="work-login-error">{error}</p> : null}
              <button type="submit" className="work-login-submit" disabled={sending}>
                {sending ? "Sending reset email..." : "Send reset email"}
              </button>
            </form>
          )}

          <div className="work-login-divider">
            <span>Remembered it?</span>
          </div>

          <Link className="work-login-outline-btn" to="/green-work/login">
            Back to sign in
          </Link>
        </section>

        <p className="work-login-footer">LandCheck Work by LandCheck Green</p>
      </div>
    </div>
  );
}
