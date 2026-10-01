import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { isWorkAuthed, registerWork } from "../auth/workAuth";
import GreenLoadingAnimation from "../components/GreenLoadingAnimation";
import { WorkLoginBackdropArt, EyeIcon } from "./GreenWorkLogin";
import "../styles/green-work-login.css";
import "../styles/green-work-login-dashboard.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

export default function GreenWorkRegister() {
  const navigate = useNavigate();
  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    if (isWorkAuthed()) navigate("/green-work", { replace: true });
  }, [navigate]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await registerWork({ organization_name: organizationName, full_name: fullName, email, password, phone });
      if ("verification_required" in result) {
        setVerificationSent(true);
        return;
      }
      navigate("/green-work", { replace: true });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: unknown } }; message?: unknown };
      const detail = typeof error.response?.data?.detail === "string" ? error.response.data.detail : "";
      const message = typeof error.message === "string" ? error.message : "";
      setError(detail || message || "Registration could not be completed.");
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
          <img src={GREEN_LOGO_SRC} alt="" width="34" height="34" />
          <span>
            <strong>LandCheck</strong>
            <small>Work</small>
          </span>
        </div>

        <section className="work-login-card">
          <span className="work-login-card-kicker">Secure organisation portal</span>
          <h1>Register your organisation</h1>
          <p className="work-login-card-sub">Create your organisation's workspace - you'll be its first admin and can add staff afterward.</p>
          {verificationSent && <p className="work-login-card-sub" role="status">We sent a verification link to <strong>{email}</strong>. Open it, then sign in to continue.</p>}

          <form className="work-login-form" onSubmit={onSubmit} aria-busy={loading}>
            <label htmlFor="work-register-org">Organisation name</label>
            <input
              id="work-register-org"
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="e.g. Greenfield Farms Ltd"
              required
            />

            <label htmlFor="work-register-name">Your full name</label>
            <input
              id="work-register-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              required
            />

            <label htmlFor="work-register-email">Email</label>
            <input
              id="work-register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@organisation.com"
              autoComplete="email"
              required
            />

            <label htmlFor="work-register-phone">Phone (optional)</label>
            <input
              id="work-register-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              autoComplete="tel"
            />

            <label htmlFor="work-register-password">Password</label>
            <div className="work-login-password-wrap">
              <input
                id="work-register-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                minLength={6}
                required
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

            {error ? <p className="work-login-error">{error}</p> : null}

            <button type="submit" className="work-login-submit" disabled={loading}>
              {loading ? "Creating workspace..." : "Create workspace"}
            </button>
            {loading && <GreenLoadingAnimation size="small" className="work-login-loading" />}
          </form>

          <div className="work-login-divider">
            <span>Already registered?</span>
          </div>

          <a className="work-login-outline-btn" href="/green-work/login">
            Sign in instead
          </a>
        </section>

        <p className="work-login-footer">LandCheck Work by LandCheck Green</p>
      </div>
    </div>
  );
}
