import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  getGreenAuthSession,
  isGreenAuthed,
  loginGreen,
  loginGreenSponsor,
  requestGreenSponsorPasswordReset,
  signUpGreenSponsor,
} from "../auth/greenAuth";
import { GreenGlyph } from "../components/GreenGlyph";
import GreenLoadingAnimation from "../components/GreenLoadingAnimation";
import "../styles/green-auth.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

type AuthRoute = "field" | "sponsor";

type RouteCopy = {
  badge: string;
  title: string;
  subtitle: string;
  microcopy: string;
  formEyebrow: string;
  formTitle: string;
  formSubtitle: string;
  icon: "leaf" | "compass";
};

const ROUTE_COPY: Record<AuthRoute, RouteCopy> = {
  sponsor: {
    badge: "Public",
    title: "Sponsor trees and follow verified impact",
    subtitle: "Track funded trees, map evidence, and verified updates from one sponsor account.",
    microcopy: "Sponsors: create an account or sign in to follow verified tree impact.",
    formEyebrow: "Sponsor portal",
    formTitle: "Sponsor sign in",
    formSubtitle: "Return to your sponsor account and keep your impact journey moving.",
    icon: "leaf",
  },
  field: {
    badge: "Partner",
    title: "Sign in for field capture and assigned work",
    subtitle: "Capture field evidence and complete assigned work through your partner organization.",
    microcopy: "Field agents: use credentials issued by your partner organization.",
    formEyebrow: "Field agent access",
    formTitle: "Field work login",
    formSubtitle: "Use the username and password already assigned in LandCheck Work.",
    icon: "compass",
  },
};

function isRoute(value: string | undefined): value is AuthRoute {
  return value === "field" || value === "sponsor";
}

export default function GreenLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ authRoute?: string }>();
  const authRoute = isRoute(params.authRoute) ? params.authRoute : null;

  const redirectTo = useMemo(() => {
    const state = (location.state || {}) as { from?: string };
    return state.from || "/green";
  }, [location.state]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<AuthRoute>(authRoute || "sponsor");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [error, setError] = useState("");
  const [sponsorSignup, setSponsorSignup] = useState(false);
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorOrgName, setSponsorOrgName] = useState("");
  const [sponsorEmail, setSponsorEmail] = useState("");
  const [sponsorPhone, setSponsorPhone] = useState("");
  const [sponsorAccountType, setSponsorAccountType] = useState<"individual" | "organization">("individual");
  const [referredByCode, setReferredByCode] = useState("");

  useEffect(() => {
    if (authRoute && authRoute !== selectedRoute) {
      setSelectedRoute(authRoute);
      setSponsorSignup(false);
      setError("");
    }
  }, [authRoute, selectedRoute]);

  useEffect(() => {
    if (!isGreenAuthed()) return;
    const existingSession = getGreenAuthSession();
    const target = existingSession?.user?.account_type === "merchant" ? "/green-merchant" : "/green";
    navigate(target, { replace: true });
  }, [navigate]);

  const selectRoute = (nextRoute: AuthRoute) => {
    setSelectedRoute(nextRoute);
    setSponsorSignup(false);
    setError("");
    navigate(`/green/login/${nextRoute}`, { replace: true });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (selectedRoute === "field") {
        await loginGreen({
          username,
          password,
          organization_id: null,
        });
      } else if (sponsorSignup) {
        await signUpGreenSponsor({
          full_name: sponsorName,
          account_type: sponsorAccountType,
          organization_name: sponsorOrgName,
          email: sponsorEmail,
          phone: sponsorPhone,
          password,
          referred_by_code: referredByCode,
        });
      } else {
        await loginGreenSponsor({
          email: sponsorEmail,
          password,
        });
      }
      const loggedInSession = getGreenAuthSession();
      const target =
        loggedInSession?.user?.account_type === "merchant" && redirectTo === "/green" ? "/green-merchant" : redirectTo;
      navigate(target, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Unable to continue.");
    } finally {
      setLoading(false);
    }
  };

  const onRequestSponsorReset = async () => {
    if (selectedRoute !== "sponsor" || sponsorSignup) return;
    setRequestingReset(true);
    setError("");
    try {
      const message = await requestGreenSponsorPasswordReset(sponsorEmail);
      setError("");
      window.alert(message);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Unable to send reset email.");
    } finally {
      setRequestingReset(false);
    }
  };

  const activeRouteCopy = ROUTE_COPY[selectedRoute];

  return (
    <div className="green-auth-page green-auth-gateway">
      <header className="green-auth-topbar">
        <button type="button" className="green-auth-brand" onClick={() => navigate("/")} aria-label="Return to LandCheck home">
          <img src={GREEN_LOGO_SRC} alt="LandCheck" width="36" height="36" />
          <span>LandCheck</span>
          <small>Mobile</small>
        </button>
        <span className="green-auth-secure-label">
          <GreenGlyph name="check-circle" /> Secure access
        </span>
      </header>

      <main className="green-auth-shell">
        <section className="green-auth-gateway-card">
          <div className="green-auth-gateway-intro">
            <div className="green-auth-brand-tile">
              <img src={GREEN_LOGO_SRC} alt="LandCheck Green" width="72" height="72" />
            </div>
            <div className="green-auth-hero-copy">
              <div className="green-auth-chip">LC Green Mobile</div>
              <h1>LandCheck Mobile</h1>
              <p>Choose an access route and sign in without leaving this page.</p>
            </div>
          </div>

          <div className="green-auth-segmented-control" role="tablist" aria-label="Choose an access route">
            <button
              type="button"
              role="tab"
              aria-selected={selectedRoute === "sponsor"}
              className={selectedRoute === "sponsor" ? "active" : ""}
              onClick={() => selectRoute("sponsor")}
            >
              <span className="green-auth-segmented-icon"><GreenGlyph name="leaf" /></span>
              <span className="green-auth-segmented-copy">
                <strong>Sponsor Portal</strong>
                <small>{ROUTE_COPY.sponsor.badge}</small>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedRoute === "field"}
              className={selectedRoute === "field" ? "active" : ""}
              onClick={() => selectRoute("field")}
            >
              <span className="green-auth-segmented-icon"><GreenGlyph name="compass" /></span>
              <span className="green-auth-segmented-copy">
                <strong>Field Agent Access</strong>
                <small>{ROUTE_COPY.field.badge}</small>
              </span>
            </button>
          </div>

          <div className="green-auth-gateway-content">
            <section className={`green-auth-route-summary ${selectedRoute}`}>
              <div className="green-auth-route-summary-icon">
                <GreenGlyph name={activeRouteCopy.icon} />
              </div>
              <span className="green-auth-summary-eyebrow">Selected route</span>
              <h2>{activeRouteCopy.title}</h2>
              <p>{activeRouteCopy.subtitle}</p>
              <p className="green-auth-microcopy">{activeRouteCopy.microcopy}</p>
              <div className="green-auth-trust-row">
                <span><GreenGlyph name="check-circle" /> Secure</span>
                <span><GreenGlyph name="pin" /> Field-ready</span>
              </div>
            </section>

            <section className="green-auth-form-card">
              <div className="green-auth-form-head">
                <span className="green-auth-form-eyebrow">
                  {selectedRoute === "field" ? activeRouteCopy.formEyebrow : sponsorSignup ? "Sponsor onboarding" : activeRouteCopy.formEyebrow}
                </span>
                <h2>
                  {selectedRoute === "field" ? activeRouteCopy.formTitle : sponsorSignup ? "Create sponsor account" : activeRouteCopy.formTitle}
                </h2>
                <p>
                  {selectedRoute === "field"
                    ? activeRouteCopy.formSubtitle
                    : sponsorSignup
                      ? "Create your sponsor profile first, then choose any public project and pay online."
                      : activeRouteCopy.formSubtitle}
                </p>
              </div>

              <form className="green-auth-form" onSubmit={onSubmit}>
                {selectedRoute === "field" ? (
                  <label className="green-auth-field">
                    <span>Username</span>
                    <input
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Enter username"
                      autoComplete="username"
                      required
                    />
                  </label>
                ) : (
                  <>
                    {sponsorSignup ? (
                      <>
                        <label className="green-auth-field">
                          <span>Full name</span>
                          <input
                            type="text"
                            value={sponsorName}
                            onChange={(event) => setSponsorName(event.target.value)}
                            placeholder="Enter full name"
                            autoComplete="name"
                            required
                          />
                        </label>

                        <div className="green-auth-account-type">
                          <span>Account type</span>
                          <div className="green-auth-segment">
                            <button
                              type="button"
                              className={sponsorAccountType === "individual" ? "active" : ""}
                              onClick={() => setSponsorAccountType("individual")}
                            >
                              Individual
                            </button>
                            <button
                              type="button"
                              className={sponsorAccountType === "organization" ? "active" : ""}
                              onClick={() => setSponsorAccountType("organization")}
                            >
                              Organization
                            </button>
                          </div>
                        </div>

                        {sponsorAccountType === "organization" ? (
                          <label className="green-auth-field">
                            <span>Organization name</span>
                            <input
                              type="text"
                              value={sponsorOrgName}
                              onChange={(event) => setSponsorOrgName(event.target.value)}
                              placeholder="Enter organization name"
                              autoComplete="organization"
                              required
                            />
                          </label>
                        ) : null}
                      </>
                    ) : null}

                    <label className="green-auth-field">
                      <span>Email</span>
                      <input
                        type="email"
                        value={sponsorEmail}
                        onChange={(event) => setSponsorEmail(event.target.value)}
                        placeholder="Enter email address"
                        autoComplete="email"
                        required
                      />
                    </label>

                    {sponsorSignup ? (
                      <>
                        <label className="green-auth-field">
                          <span>Phone</span>
                          <input
                            type="tel"
                            value={sponsorPhone}
                            onChange={(event) => setSponsorPhone(event.target.value)}
                            placeholder="Enter phone number"
                            autoComplete="tel"
                            required
                          />
                        </label>

                        <label className="green-auth-field">
                          <span>Referral code <em>optional</em></span>
                          <input
                            type="text"
                            value={referredByCode}
                            onChange={(event) => setReferredByCode(event.target.value.toUpperCase())}
                            placeholder="e.g. LC-REF-123-ABCD"
                          />
                        </label>
                      </>
                    ) : null}
                  </>
                )}

                <label className="green-auth-field">
                  <span>Password</span>
                  <div className="green-auth-password-wrap">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={selectedRoute === "field" ? "Enter assigned password" : "Create or enter password"}
                      autoComplete={selectedRoute === "field" || !sponsorSignup ? "current-password" : "new-password"}
                      required
                    />
                    <button
                      type="button"
                      className="green-auth-password-eye"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      <GreenGlyph name={showPassword ? "eye-off" : "eye"} />
                    </button>
                  </div>
                </label>

                {selectedRoute === "sponsor" && !sponsorSignup ? (
                  <div className="green-auth-support">
                    <button type="button" onClick={() => void onRequestSponsorReset()} disabled={requestingReset || loading}>
                      {requestingReset ? "Sending reset email..." : "Forgot password? Send reset email"}
                    </button>
                    <span>Enter your sponsor email above first.</span>
                  </div>
                ) : null}

                {error ? <p className="green-auth-error">{error}</p> : null}

                <button type="submit" className="green-auth-submit" disabled={loading}>
                  {loading ? "Please wait..." : selectedRoute === "field" ? "Login" : sponsorSignup ? "Create Sponsor Account" : "Sign In"}
                </button>
                {loading && <GreenLoadingAnimation size="small" />}

                {selectedRoute === "sponsor" ? (
                  <div className="green-auth-toggle">
                    <span>{sponsorSignup ? "Already have a sponsor account?" : "Need a sponsor account first?"}</span>
                    <button type="button" onClick={() => setSponsorSignup((prev) => !prev)}>
                      {sponsorSignup ? "Sign in instead" : "Create account"}
                    </button>
                  </div>
                ) : null}
              </form>

              <p className="green-auth-privacy">
                By continuing, you agree to handle project, GPS, photo, and field records only when authorized. {" "}
                <a href="/privacy">Privacy policy</a>
              </p>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
