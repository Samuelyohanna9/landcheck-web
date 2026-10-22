import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, extractApiErrorMessage } from "../api/client";
import "../styles/password-reset.css";

type ResetProduct = "estates" | "green-sponsor" | "green-work";

type ResetConfig = {
  label: string;
  kicker: string;
  title: string;
  description: string;
  endpoint: string;
  loginPath: string;
};

const RESET_CONFIG: Record<ResetProduct, ResetConfig> = {
  estates: {
    label: "LandCheck Estates",
    kicker: "Company workspace",
    title: "Reset your password",
    description: "Choose a new password for your Estates account.",
    endpoint: "/estates/auth/reset-password",
    loginPath: "/estates/login",
  },
  "green-sponsor": {
    label: "LandCheck Green",
    kicker: "Sponsor account",
    title: "Reset your password",
    description: "Choose a new password for your sponsor account.",
    endpoint: "/green/sponsor-auth/reset-password",
    loginPath: "/green/login/sponsor",
  },
  "green-work": {
    label: "LandCheck Work",
    kicker: "Secure organisation portal",
    title: "Reset your password",
    description: "Choose a new password for your LandCheck Work account.",
    endpoint: "/green/green-auth/reset-password",
    loginPath: "/green-work/login",
  },
};

function isResetProduct(value: string | null): value is ResetProduct {
  return value === "estates" || value === "green-sponsor" || value === "green-work";
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      {off && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PasswordResetPage({ defaultProduct }: { defaultProduct?: ResetProduct }) {
  const [searchParams] = useSearchParams();
  const queryProduct = searchParams.get("product");
  const product = defaultProduct || (isResetProduct(queryProduct) ? queryProduct : undefined);
  const config = product ? RESET_CONFIG[product] : null;
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successLoginPath, setSuccessLoginPath] = useState("");

  const passwordValid = password.length >= 8;
  const confirmStarted = confirmPassword.length > 0;
  const passwordsMatch = confirmStarted && password === confirmPassword;
  const passwordsMismatch = confirmStarted && password !== confirmPassword;

  const statusText = useMemo(() => {
    if (!confirmStarted) return "Repeat your password to confirm it.";
    return passwordsMatch ? "Passwords match." : "Passwords do not match.";
  }, [confirmStarted, passwordsMatch]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!config || !product) {
      setError("This reset link is missing its product information. Request a new reset link.");
      return;
    }
    if (!token) {
      setError("This reset link is missing its security token. Request a new reset link.");
      return;
    }
    if (!passwordValid) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!passwordsMatch) {
      setError("The two password entries do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await api.post<{ account_type?: string }>(config.endpoint, { token, new_password: password });
      const loginPath = product === "green-sponsor" && response.data?.account_type === "merchant"
        ? "/green-merchant/login"
        : config.loginPath;
      setSuccessLoginPath(loginPath);
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(await extractApiErrorMessage(requestError, "This reset link is invalid or has expired. Request a new one."));
    } finally {
      setBusy(false);
    }
  };

  const loginPath = successLoginPath || config?.loginPath || "/";

  return (
    <main className="password-reset-page">
      <div className="password-reset-shell">
        <Link to="/" className="password-reset-brand" aria-label="LandCheck home">
          <img src="/logo-wordmark-web.png" alt="LandCheck" width="182" height="58" />
          {config && <span>{config.label.replace("LandCheck ", "")}</span>}
        </Link>

        {successLoginPath ? (
          <section className="password-reset-card password-reset-success-card" aria-live="polite">
            <div className="password-reset-success-icon"><CheckIcon /></div>
            <p className="password-reset-kicker">Password updated</p>
            <h1>Password reset successful</h1>
            <p>Your password has been changed securely. You can now sign in with your new password.</p>
            <Link className="password-reset-submit" to={loginPath}>Continue to sign in</Link>
            <p className="password-reset-redirect-note">You will stay on this page until you choose to continue.</p>
          </section>
        ) : (
          <section className="password-reset-card">
            <p className="password-reset-kicker">{config?.kicker || "Secure account access"}</p>
            <h1>{config?.title || "Reset your password"}</h1>
            <p className="password-reset-description">
              {config?.description || "Use the secure link from your email to choose a new password."}
            </p>

            <form className="password-reset-form" onSubmit={submit} noValidate>
              <label className="password-reset-field">
                <span>New password</span>
                <div className="password-reset-input-wrap">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    aria-describedby="password-requirement"
                    required
                  />
                  <button type="button" className="password-reset-eye" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide new password" : "Show new password"}>
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
              </label>
              <p id="password-requirement" className={`password-reset-check ${passwordValid ? "is-good" : ""}`}>
                {passwordValid ? <CheckIcon /> : <span className="password-reset-check-dot" />}
                At least 8 characters
              </p>

              <label className="password-reset-field">
                <span>Confirm new password</span>
                <div className={`password-reset-input-wrap ${passwordsMismatch ? "is-invalid" : passwordsMatch ? "is-valid" : ""}`}>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    aria-invalid={passwordsMismatch}
                    aria-describedby="password-match-status"
                    required
                  />
                  <button type="button" className="password-reset-eye" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"}>
                    <EyeIcon off={showConfirmPassword} />
                  </button>
                </div>
              </label>
              <p id="password-match-status" className={`password-reset-check ${passwordsMatch ? "is-good" : passwordsMismatch ? "is-bad" : ""}`}>
                {passwordsMatch ? <CheckIcon /> : <span className="password-reset-check-dot" />}
                {statusText}
              </p>

              {error && <div className="password-reset-error" role="alert">{error}</div>}
              <button className="password-reset-submit" type="submit" disabled={busy}>
                {busy ? "Saving password..." : "Save new password"}
              </button>
            </form>

            <p className="password-reset-help">If this link has expired, request a new reset link from your product sign-in page.</p>
            <Link className="password-reset-login-link" to={config?.loginPath || "/"}>Return to sign in</Link>
          </section>
        )}

        <p className="password-reset-footer">Secure password recovery for LandCheck products</p>
      </div>
    </main>
  );
}
