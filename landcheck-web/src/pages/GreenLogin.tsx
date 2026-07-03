import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  isGreenAuthed,
  loginGreen,
  loginGreenSponsor,
  requestGreenSponsorPasswordReset,
  signUpGreenSponsor,
} from "../auth/greenAuth";
import "../styles/green-auth.css";

const GREEN_LOGO_SRC = "/green-logo-cropped-760.png";

type AuthRoute = "field" | "sponsor";

type RouteCopy = {
  eyebrow: string;
  badge: string;
  title: string;
  subtitle: string;
  audienceTitle: string;
  audienceItems: string[];
  guidanceItems: string[];
  icon: "leaf" | "compass";
};

const ROUTE_COPY: Record<AuthRoute, RouteCopy> = {
  sponsor: {
    eyebrow: "Public sponsor route",
    badge: "Sponsor access",
    title: "Sponsor trees and follow verified impact",
    subtitle: "For individuals and organizations supporting approved public tree projects through secure online sponsorship.",
    audienceTitle: "Who this route is for",
    audienceItems: [
      "People or organizations sponsoring trees with their own account.",
      "Users who want project selection, payment, map evidence, and maintenance updates.",
      "Supporters who need a personal sponsor profile before any payment is made.",
    ],
    guidanceItems: [
      "Create an account first, then choose a public sponsor project.",
      "Use your email and password to return later and track sponsored trees.",
      "Payments and evidence may be reviewed by the LandCheck Green admin team.",
    ],
    icon: "leaf",
  },
  field: {
    eyebrow: "Partner field route",
    badge: "Field access",
    title: "Sign in for field capture and assigned work",
    subtitle: "For verified agents, supervisors, and partner staff already onboarded in LandCheck Work by an organization admin.",
    audienceTitle: "Who this route is for",
    audienceItems: [
      "Agents or supervisors already issued a username and password in LandCheck Work.",
      "Users capturing field evidence, plot data, tree records, reviews, or assigned tasks.",
      "Partner staff working under an organization or sponsor project workflow.",
    ],
    guidanceItems: [
      "No sign up happens on this route.",
      "Use the exact username and password already assigned by your organization.",
      "By continuing, you confirm you are authorized to access LandCheck Green field data for your organization or project.",
    ],
    icon: "compass",
  },
};

function RouteGlyph({ icon }: { icon: RouteCopy["icon"] }) {
  if (icon === "leaf") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M19 5C12 5 7 9 5 15c2.5 1.5 5.6 1.8 8.3.6 2.8-1.2 4.9-3.8 5.7-7.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 16c2-3 5-5.3 9-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9.5 14.5 11 11l3.5-1.5L13 13l-3.5 1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

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
    if (!isGreenAuthed()) return;
    navigate("/green", { replace: true });
  }, [navigate]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!authRoute) return;
    setLoading(true);
    setError("");
    try {
      if (authRoute === "field") {
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
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Unable to continue.");
    } finally {
      setLoading(false);
    }
  };

  const onRequestSponsorReset = async () => {
    if (authRoute !== "sponsor" || sponsorSignup) return;
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

  if (!authRoute) {
    return (
      <div className="green-auth-page">
        <div className="green-auth-shell">
          <section className="green-auth-hero">
            <div className="green-auth-brand-tile">
              <img src={GREEN_LOGO_SRC} alt="LandCheck Green" width="72" height="72" />
            </div>
            <div className="green-auth-hero-copy">
              <div className="green-auth-chip">LC Green Mobile</div>
              <h1>LandCheck Mobile</h1>
              <p>Choose how you want to enter the app. Each route opens its own secure login flow.</p>
            </div>
          </section>

          <section className="green-auth-route-grid">
            {([
              {
                route: "sponsor",
                title: "Sponsor Trees",
                badge: "Public route",
                blurb: "Track your environmental impact. This route starts with sponsor account sign up, then secure online payment and live tree updates.",
                icon: "leaf" as const,
              },
              {
                route: "field",
                title: "Perform Field Work",
                badge: "Partner route",
                blurb: "For verified agents and partners. No sign up here. Use the login details from your organization partner.",
                icon: "compass" as const,
              },
            ] as const).map((item) => (
              <button
                key={item.route}
                type="button"
                className={`green-auth-route-card ${item.route === "sponsor" ? "sponsor" : "field"}`}
                onClick={() => navigate(`/green/login/${item.route}`)}
              >
                <div className="green-auth-route-icon">
                  <RouteGlyph icon={item.icon} />
                </div>
                <div className="green-auth-route-copy">
                  <div className="green-auth-route-head">
                    <strong>{item.title}</strong>
                    <span>{item.badge}</span>
                  </div>
                  <p>{item.blurb}</p>
                </div>
                <div className="green-auth-route-arrow">→</div>
              </button>
            ))}
          </section>

          <section className="green-auth-note">
            <strong>Before you continue</strong>
            <p>Sponsor users create their own public sponsor account. Field users do not sign up here and should use credentials already issued by their organization.</p>
          </section>
        </div>
      </div>
    );
  }

  const activeRouteCopy = ROUTE_COPY[authRoute];

  return (
    <div className="green-auth-page">
      <div className="green-auth-shell auth-form-layout">
        <section className={`green-auth-hero detail ${authRoute}`}>
          <button type="button" className="green-auth-back" onClick={() => navigate("/green/login")}>
            ← Routes
          </button>

          <div className="green-auth-detail-head">
            <div className="green-auth-brand-tile small">
              <img src={GREEN_LOGO_SRC} alt="LandCheck Green" width="72" height="72" />
            </div>
            <div className="green-auth-detail-orb">
              <RouteGlyph icon={activeRouteCopy.icon} />
            </div>
          </div>

          <div className="green-auth-hero-copy">
            <div className="green-auth-chip">{activeRouteCopy.badge}</div>
            <h1>{activeRouteCopy.title}</h1>
            <p>{activeRouteCopy.subtitle}</p>
          </div>

          <div className="green-auth-guidance-card">
            <strong>{activeRouteCopy.audienceTitle}</strong>
            <ul>
              {activeRouteCopy.audienceItems.map((item) => (
                <li key={`audience-${item}`}>{item}</li>
              ))}
            </ul>
            <div className="green-auth-guidance-divider" />
            <strong>Before you continue</strong>
            <ul>
              {activeRouteCopy.guidanceItems.map((item) => (
                <li key={`guide-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="green-auth-form-card">
          <div className="green-auth-form-head">
            <span className="green-auth-form-eyebrow">
              {authRoute === "field" ? "Secure partner access" : sponsorSignup ? "Sponsor onboarding" : "Sponsor account access"}
            </span>
            <h2>
              {authRoute === "field"
                ? "Field work login"
                : sponsorSignup
                  ? "Create sponsor account"
                  : "Sponsor sign in"}
            </h2>
            <p>
              {authRoute === "field"
                ? "Use the same username and password already assigned in LandCheck Work."
                : sponsorSignup
                  ? "Create your sponsor profile first, then choose any public project and pay online."
                  : "Sign in to your sponsor account to track funded trees, map evidence, and verified updates."}
            </p>
          </div>

          <form className="green-auth-form" onSubmit={onSubmit}>
            {authRoute === "field" ? (
              <label className="green-auth-field">
                <span>Username</span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
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
                      />
                    </label>

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

                    {sponsorAccountType === "organization" ? (
                      <label className="green-auth-field">
                        <span>Organization name</span>
                        <input
                          type="text"
                          value={sponsorOrgName}
                          onChange={(event) => setSponsorOrgName(event.target.value)}
                          placeholder="Enter organization name"
                          autoComplete="organization"
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
                      />
                    </label>

                    <label className="green-auth-field">
                      <span>Referral code (optional)</span>
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
                  placeholder={authRoute === "field" ? "Enter assigned password" : "Create or enter password"}
                  autoComplete={authRoute === "field" || !sponsorSignup ? "current-password" : "new-password"}
                />
                <button type="button" className="green-auth-password-eye" onClick={() => setShowPassword((prev) => !prev)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            {authRoute === "sponsor" && !sponsorSignup ? (
              <div className="green-auth-support">
                <button type="button" onClick={() => void onRequestSponsorReset()} disabled={requestingReset || loading}>
                  {requestingReset ? "Sending reset email..." : "Forgot password? Send reset email"}
                </button>
                <span>Enter your sponsor email above first.</span>
              </div>
            ) : null}

            {error ? <p className="green-auth-error">{error}</p> : null}

            <button type="submit" className="green-auth-submit" disabled={loading}>
              {loading ? "Please wait..." : authRoute === "field" ? "Login" : sponsorSignup ? "Create Sponsor Account" : "Sign In"}
            </button>

            {authRoute === "sponsor" ? (
              <div className="green-auth-toggle">
                <span>{sponsorSignup ? "Already have a sponsor account?" : "Need a sponsor account first?"}</span>
                <button type="button" onClick={() => setSponsorSignup((prev) => !prev)}>
                  {sponsorSignup ? "Sign in instead" : "Create account"}
                </button>
              </div>
            ) : null}
          </form>

          <p className="green-auth-privacy">
            By continuing, you agree to handle project, GPS, photo, and field records only when authorized.{" "}
            <a href="/privacy">Privacy policy</a>
          </p>
        </section>
      </div>
    </div>
  );
}
