import { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { prefetchSurveyPlanPreviewStep, prefetchSurveyPlanRoute } from "../utils/surveyPlanPrefetch";
import { isSurveyAuthed } from "../auth/surveyAuth";
import { lazyWithChunkRecovery } from "../utils/lazyWithChunkRecovery";
import "../styles/navbar.css";

const SignupGateModal = lazyWithChunkRecovery(() => import("./SignupGateModal"));

// Grouped into dropdowns (was one flat row of 5+ links) so the bar reads cleanly instead of
// spelling out every product and every company page across the top of every LandCheck page.
// Exported so pages with their own hand-built nav (Survey Plan's landing page) can render the
// exact same Products/Company groups instead of maintaining a second copy of this list.
export const NAV_GROUPS = [
  {
    label: "Products",
    items: [
      { label: "LandCheck Green", route: "/green-partners" },
      { label: "LandCheck Estates", route: "/estates" },
      { label: "Survey Plan", route: "/survey" },
      { label: "Flood Analysis", route: "/flood" },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "Career", route: "/career" },
      { label: "News", route: "/news" },
    ],
  },
] as const;

interface NavBarProps {
  /** Logo image src. Defaults to the icon mark, or the full wordmark lockup (icon + "LandCheck" +
   * tagline) when `light` is set or `logoBadge="wordmark"` - the brand wordmark's dark ink text
   * needs a light background to read, so only pass it yourself alongside some other light
   * treatment you're giving the bar. */
  logoSrc?: string;
  /** `true`: icon alone in a small white square badge (GreenPartnersLanding style) - for a bar
   * with little vertical room. `"wordmark"`: the full lockup in a wider white chip - this is the
   * one to reach for by default, since the chip carries its own opaque background regardless of
   * what's behind the bar (dark, transparent-over-photo, anything), so it's always safe and shows
   * the full brand name rather than just the icon. */
  logoBadge?: boolean | "wordmark";
  /** White bar instead of the usual dark one, with the full wordmark lockup sitting directly on
   * it rather than in its own chip (the R3GIS-style compact header). Use only when the page's own
   * hero/body is itself light, so the bar doesn't look like an inserted strip - logoBadge="wordmark"
   * is the safer default since it doesn't depend on what's behind the bar.
   * Only restyles the top bar - the slide-in mobile drawer stays the usual dark panel, since it's
   * a separate surface and the icon mark already reads fine on it. */
  light?: boolean;
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

const ICON_LOGO_SRC = "/logo-icon-192.png";
const WORDMARK_LOGO_SRC = "/logo-wordmark-web.png";

export default function NavBar({
  logoSrc,
  logoBadge = false,
  light = false,
  fixed = false,
  activeRoute,
  ctaLabel,
  ctaRoute,
  overlay = false,
}: NavBarProps) {
  const resolvedLogoSrc = logoSrc ?? (light || logoBadge === "wordmark" ? WORDMARK_LOGO_SRC : ICON_LOGO_SRC);
  const logoIsWordmark = resolvedLogoSrc === WORDMARK_LOGO_SRC;
  const brandClassName = [
    "lc-nav-brand",
    logoBadge === true && "lc-nav-brand--badge",
    logoBadge === "wordmark" && "lc-nav-brand--wordmark-badge",
  ].filter(Boolean).join(" ");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const desktopNavRef = useRef<HTMLElement>(null);
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

  // Closes an open dropdown on an outside click or Escape - same dismissal convention used by
  // the Estate landing page's own mobile drawer and Dashboard's "New Work" menu.
  useEffect(() => {
    if (!openGroup) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (desktopNavRef.current && !desktopNavRef.current.contains(event.target as Node)) setOpenGroup(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenGroup(null); };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openGroup]);

  return (
    <>
      <header className={`lc-nav${light ? " lc-nav--light" : ""}${fixed ? " lc-nav--fixed" : ""}${overlay ? " lc-nav--overlay" : ""}`}>
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
          className={brandClassName}
          onClick={() => navigate("/")}
        >
          <img src={resolvedLogoSrc} alt="LandCheck" width={logoIsWordmark ? "182" : "140"} height={logoIsWordmark ? "58" : "42"} />
        </button>

        {/* Desktop links */}
        <nav className="lc-nav-desktop" aria-label="Main navigation" ref={desktopNavRef}>
          {NAV_GROUPS.map((group) => {
            const groupActive = group.items.some((item) => item.route === activeRoute);
            return (
              <div key={group.label} className="lc-nav-group">
                <button
                  type="button"
                  className={groupActive ? "lc-nav-item-active" : undefined}
                  aria-haspopup="true"
                  aria-expanded={openGroup === group.label}
                  onClick={() => setOpenGroup((prev) => (prev === group.label ? null : group.label))}
                >
                  {group.label}
                  <svg className="lc-nav-group-caret" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                {openGroup === group.label && (
                  <div className="lc-nav-group-menu" role="menu">
                    {group.items.map((item) => (
                      <button
                        key={item.route}
                        type="button"
                        role="menuitem"
                        className={activeRoute === item.route ? "lc-nav-item-active" : undefined}
                        onMouseEnter={item.route === "/survey" ? warmSurveyPlanEntry : undefined}
                        onFocus={item.route === "/survey" ? warmSurveyPlanEntry : undefined}
                        onClick={() => { navigate(item.route); setOpenGroup(null); }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <a
            href="mailto:support@landcheck.online?subject=LandCheck%20Support"
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

          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="lc-mobile-group">
              <span className="lc-mobile-group-label">{group.label}</span>
              {group.items.map((item) => (
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
            </div>
          ))}

          <a
            href="mailto:support@landcheck.online?subject=LandCheck%20Support"
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
