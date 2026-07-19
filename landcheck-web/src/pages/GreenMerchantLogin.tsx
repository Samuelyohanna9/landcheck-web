import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getGreenAuthSession, isGreenAuthed, loginGreenSponsor, requestGreenSponsorPasswordReset } from "../auth/greenAuth";
import { GreenGlyph } from "../components/GreenGlyph";
import "../styles/green-merchant.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

export default function GreenMerchantLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  const redirectTo = useMemo(() => {
    const state = (location.state || {}) as { from?: string };
    return state.from || "/green-merchant";
  }, [location.state]);

  useEffect(() => {
    if (!isGreenAuthed()) return;
    const session = getGreenAuthSession();
    navigate(session?.user?.account_type === "merchant" ? "/green-merchant" : "/green", { replace: true });
  }, [navigate]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setResetMessage("");
    setLoading(true);
    try {
      await loginGreenSponsor({ email, password });
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    if (!email.trim()) {
      setError("Enter your merchant account email above first.");
      return;
    }
    setError("");
    setResetMessage("");
    setRequestingReset(true);
    try {
      const message = await requestGreenSponsorPasswordReset(email);
      setResetMessage(message);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Could not send reset email.");
    } finally {
      setRequestingReset(false);
    }
  };

  return (
    <div className="gm-login-page">
      <div className="gm-login-card">
        <div className="gm-login-brand">
          <img src={GREEN_LOGO_SRC} alt="LandCheck Green" className="gm-login-logo" width="56" height="56" />
          <div className="gm-eyebrow">LandCheck Green &middot; Merchant Partner</div>
          <h1>Merchant Partner Login</h1>
          <p>Sign in to view sponsorship activity, orders, and impact for your integration.</p>
        </div>

        <form className="gm-login-form" onSubmit={onSubmit}>
          <label htmlFor="gm-login-email">Email</label>
          <input
            id="gm-login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourbusiness.com"
            autoComplete="username"
            required
          />

          <label htmlFor="gm-login-password">Password</label>
          <div className="gm-login-password-wrap">
            <input
              id="gm-login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="gm-login-eye"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <GreenGlyph name={showPassword ? "eye-off" : "eye"} />
            </button>
          </div>

          <button type="button" className="gm-login-forgot" onClick={onForgotPassword} disabled={requestingReset}>
            {requestingReset ? "Sending..." : "Forgot password? Send reset email"}
          </button>

          {error ? <p className="gm-login-error">{error}</p> : null}
          {resetMessage ? <p className="gm-login-success">{resetMessage}</p> : null}

          <button type="submit" className="gm-login-submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="gm-login-footnote">
          Merchant accounts are set up by the LandCheck Green team. If you don't have credentials yet, contact your
          onboarding admin.
        </p>
      </div>
    </div>
  );
}
