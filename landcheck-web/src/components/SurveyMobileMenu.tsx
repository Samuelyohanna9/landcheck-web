import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "../styles/survey-mobile-menu.css";

export default function SurveyMobileMenu({
  isOpen,
  onClose,
  title = "LandCheck Survey",
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="survey-mobile-menu-overlay" onClick={onClose}>
      <aside
        className="survey-mobile-menu-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} mobile menu`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="survey-mobile-menu-head">
          <div className="survey-mobile-menu-brand">
            <span className="survey-mobile-menu-logo"><img src="/logo.svg" alt="" /></span>
            <strong>{title}</strong>
          </div>
          <button type="button" className="survey-mobile-menu-close" onClick={onClose} aria-label="Close menu">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav className="survey-mobile-menu-items" aria-label={`${title} actions`}>
          {children}
        </nav>
      </aside>
    </div>,
    document.body,
  );
}
