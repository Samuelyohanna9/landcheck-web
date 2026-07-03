import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/navbar.css";

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
}

export default function NavBar({
  logoSrc = "/logo.svg",
  logoBadge = false,
  fixed = false,
  activeRoute,
  ctaLabel,
  ctaRoute,
}: NavBarProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleNav = (route: string) => {
    navigate(route);
    setOpen(false);
  };

  return (
    <>
      <header className={`lc-nav${fixed ? " lc-nav--fixed" : ""}`}>
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
          {ctaLabel && ctaRoute && (
            <button
              type="button"
              className="lc-nav-cta"
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

          {ctaLabel && ctaRoute && (
            <button
              type="button"
              className="lc-mobile-cta"
              onClick={() => handleNav(ctaRoute)}
            >
              {ctaLabel}
            </button>
          )}
        </nav>
      </div>
    </>
  );
}
