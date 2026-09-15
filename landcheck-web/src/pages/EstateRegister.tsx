import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { extractApiErrorMessage } from "../api/client";
import { registerEstate } from "../auth/estateAuth";
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

export default function EstateRegister() {
  const navigate = useNavigate();
  const [company, setCompany] = useState("");
  const [slug, setSlug] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await registerEstate({ organization_name: company, organization_slug: slug, full_name: fullName, email, password });
      navigate("/estates/choose-plan", { replace: true });
    } catch (err) {
      setError(await extractApiErrorMessage(err, "Registration failed. Please review the details and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="estate-auth-page">
      <div className="estate-auth-shell estate-auth-shell--register">
        <div className="estate-register-intro">
          <Link to="/estates" className="estate-auth-brand" aria-label="LandCheck Estates home">
            <span className="estate-auth-brand-logo"><img src="/logo.svg" alt="LandCheck" width="520" height="140" /></span>
            <span className="estate-auth-brand-tag">Estates</span>
          </Link>
          <p className="estate-kicker">Start with the land</p>
          <h1>Your company's estate workspace.</h1>
          <p>Register once, then invite your operating team around a shared parcel register. Your first account is the company owner.</p>
          <div className="estate-register-points">
            <span><b>01</b> Import your layout</span>
            <span><b>02</b> Publish approved plots</span>
            <span><b>03</b> Manage customers and delivery</span>
          </div>
        </div>
        <div className="estate-auth-card">
          <p className="estate-kicker">Company registration</p>
          <h2>Create your workspace</h2>
          <form onSubmit={submit}>
            <label>
              Company / developer name
              <input value={company} onChange={(event) => setCompany(event.target.value)} autoComplete="organization" required />
            </label>
            <label>
              Workspace address <small>optional</small>
              <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="your-company" autoComplete="off" />
            </label>
            <label>
              Your full name
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required />
            </label>
            <label>
              Company email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </label>
            <label>
              Password <small>8 characters minimum</small>
              <div className="estate-password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
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
            <button className="estate-button" type="submit" disabled={busy}>{busy ? "Creating workspace..." : "Create Estate workspace"}</button>
          </form>
          <p className="estate-auth-trust">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.6" /></svg>
            Secure, encrypted connection
          </p>
          <p className="estate-auth-switch">Already registered? <Link to="/estates/login">Sign in</Link></p>
        </div>
      </div>
    </main>
  );
}
