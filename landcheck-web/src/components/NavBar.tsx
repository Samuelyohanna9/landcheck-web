import { Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import { prefetchSurveyPlanPreviewStep, prefetchSurveyPlanRoute } from "../utils/surveyPlanPrefetch";
import { isSurveyAuthed } from "../auth/surveyAuth";
import { lazyWithChunkRecovery } from "../utils/lazyWithChunkRecovery";
import "../styles/navbar.css";

const SignupGateModal = lazyWithChunkRecovery(() => import("./SignupGateModal"));

const NAV_ITEMS = [
  { label: "LandCheck Green", route: "/green-partners" },
  { label: "Survey Plan", route: "/survey" },
  { label: "Flood Analysis", route: "/flood" },
  { label: "Career", route: "/career" },
  { label: "News", route: "/news" },
] as const;

interface NavBarProps {
  /** Logo image src. Defaults to /logo.svg */
  logoSrc?: string;
  /** Renders logo inside the white-square badge (GreenPartnersLanding style) */
  logoBadge?: boolean;
  /** Fixes nav over hero background (use for full-screen hero pages) */
  fixed?: boolean;
  /** Route string matching current page — highlights that nav item */
  activeRoute?: string;
  /** Optional right-side CTA button label */
  ctaLabel?: string;
  /** Route for the right-side CTA */
  ctaRoute?: string;
  /** Transparent overlay treatment for full-bleed hero backgrounds */
  overlay?: boolean;
}

export default function NavBar({
  logoSrc = "/logo.svg",
  logoBadge = false,
  fixed = false,
  activeRoute,
  ctaLabel,
  ctaRoute,
  overlay = false,
}: NavBarProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const showDashboardLink = isSurveyAuthed();
  // Only surfaced on Survey-related pages - Survey has its own separate account system from
  // Green/Work, so a "Sign in" link here would be out of place on the Green/Flood nav bars.
  const showSignInLink = !showDashboardLink && ctaRoute === "/survey-plan";

  const warmSurveyPlanEntry = () => {
    void prefetchSurveyPlanRoute();
    void prefetchSurveyPlanPreviewStep();
  };

  const handleNav = (route: string) => {
    navigate(route);
    setOpen(false);
  };

  return (
    <>
      <header className={`lc-nav${fixed ? " lc-nav--fixed" : ""}${overlay ? " lc-nav--overlay" : ""}`}>
        {/* Hamburger — top left on mobile */}
        <button
          type="button"
          className="lc-nav-hamburger"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
        >
          <span />
          <span />
          <span />
        </button>

        {/* Logo */}
        <button
          type="button"
          className={logoBadge ? "lc-nav-brand lc-nav-brand--badge" : "lc-nav-brand"}
          onClick={() => navigate("/")}
        >
          <img src={logoSrc} alt="LandCheck" width="140" height="42" />
        </button>

        {/* Desktop links */}
        <nav className="lc-nav-desktop" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.route}
              type="button"
              className={activeRoute === item.route ? "lc-nav-item-active" : undefined}
              onMouseEnter={item.route === "/survey" ? warmSurveyPlanEntry : undefined}
              onFocus={item.route === "/survey" ? warmSurveyPlanEntry : undefined}
              onClick={() => navigate(item.route)}
            >
              {item.label}
            </button>
          ))}
          <a
            href="mailto:landchecktech@gmail.com?subject=LandCheck%20Support"
            className="lc-nav-link"
          >
            Support
          </a>
          {showDashboardLink && (
            <button
              type="button"
              className={activeRoute === "/dashboard" ? "lc-nav-item-active" : undefined}
              onClick={() => navigate("/dashboard")}
            >
              My Dashboard
            </button>
          )}
          {showSignInLink && (
            <button type="button" onClick={() => setSignInOpen(true)}>
              Sign in
            </button>
          )}
          {ctaLabel && ctaRoute && (
            <button
              type="button"
              className="lc-nav-cta"
              onMouseEnter={ctaRoute === "/survey-plan" ? warmSurveyPlanEntry : undefined}
              onFocus={ctaRoute === "/survey-plan" ? warmSurveyPlanEntry : undefined}
              onClick={() => navigate(ctaRoute)}
            >
              {ctaLabel}
            </button>
          )}
        </nav>
      </header>

      {/* Mobile drawer overlay */}
      <div
        className={`lc-mobile-overlay${open ? " lc-mobile-overlay--open" : ""}`}
        onClick={() => setOpen(false)}
      >
        <nav
          className={`lc-mobile-drawer${open ? " lc-mobile-drawer--open" : ""}`}
          onClick={(e) => e.stopPropagation()}
          aria-label="Mobile navigation"
        >
          <div className="lc-mobile-header">
            <img src={logoSrc} alt="LandCheck" className="lc-mobile-logo" width="110" height="36" />
            <button
              type="button"
              className="lc-mobile-close"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              ✕
            </button>
          </div>

          {NAV_ITEMS.map((item) => (
            <button
              key={item.route}
              type="button"
              className={`lc-mobile-item${activeRoute === item.route ? " lc-mobile-item--active" : ""}`}
              onFocus={item.route === "/survey" ? warmSurveyPlanEntry : undefined}
              onTouchStart={item.route === "/survey" ? warmSurveyPlanEntry : undefined}
              onClick={() => handleNav(item.route)}
            >
              {item.label}
            </button>
          ))}

          <a
            href="mailto:landchecktech@gmail.com?subject=LandCheck%20Support"
            className="lc-mobile-item"
            onClick={() => setOpen(false)}
          >
            Support
          </a>

          {showDashboardLink && (
            <button
              type="button"
              className={`lc-mobile-item${activeRoute === "/dashboard" ? " lc-mobile-item--active" : ""}`}
              onClick={() => handleNav("/dashboard")}
            >
              My Dashboard
            </button>
          )}

          {showSignInLink && (
            <button
              type="button"
              className="lc-mobile-item"
              onClick={() => {
                setOpen(false);
                setSignInOpen(true);
              }}
            >
              Sign in
            </button>
          )}

          {ctaLabel && ctaRoute && (
            <button
              type="button"
              className="lc-mobile-cta"
              onFocus={ctaRoute === "/survey-plan" ? warmSurveyPlanEntry : undefined}
              onTouchStart={ctaRoute === "/survey-plan" ? warmSurveyPlanEntry : undefined}
              onClick={() => handleNav(ctaRoute)}
            >
              {ctaLabel}
            </button>
          )}
        </nav>
      </div>

      {signInOpen && (
        <Suspense fallback={null}>
          <SignupGateModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
