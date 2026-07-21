import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  defaultCookiePreferences,
  useCookieConsent,
  type CookiePreferences,
} from "../privacy/cookieConsent";
import { PRIVACY_POLICY_PATH } from "../privacy/privacyConsent";
import "../styles/cookie-consent.css";

type DraftPreferences = CookiePreferences;

const cookieCategories = [
  {
    key: "essential",
    title: "Essential site storage",
    summary: "Required for secure navigation, login state, consent retention, and core page behavior.",
    locked: true,
  },
  {
    key: "experience",
    title: "Experience media",
    summary: "Enables richer page features such as background media, hero presentation, and similar optional visual enhancements.",
    locked: false,
  },
  {
    key: "measurement",
    title: "Measurement and reliability",
    summary: "Allows LandCheck to understand reliability and page usage trends when measurement tools are enabled. Never used for advertising.",
    locked: false,
  },
] as const;

export default function CookieConsentManager() {
  const location = useLocation();
  const { ready, hasDecision, preferences, acceptAll, acceptEssentialOnly, saveConsent } = useCookieConsent();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<DraftPreferences>(defaultCookiePreferences);

  useEffect(() => {
    setDraft({
      essential: true,
      experience: preferences.experience,
      measurement: preferences.measurement,
    });
  }, [preferences.experience, preferences.measurement]);

  useEffect(() => {
    if (!isModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isModalOpen]);

  const pathLabel = useMemo(() => {
    const path = location.pathname || "/";
    if (path.startsWith("/green-work")) return "LandCheck Work";
    if (path.startsWith("/green")) return "LandCheck Green";
    if (path.startsWith("/sponsor")) return "Public sponsorship";
    return "LandCheck";
  }, [location.pathname]);

  if (!ready) return null;

  const openPreferences = () => setIsModalOpen(true);
  const closePreferences = () => setIsModalOpen(false);
  const handleAcceptAll = () => {
    acceptAll();
    setIsModalOpen(false);
  };
  const handleAcceptEssentialOnly = () => {
    acceptEssentialOnly();
    setIsModalOpen(false);
  };
  const saveCustomPreferences = () => {
    saveConsent(
      {
        experience: draft.experience,
        measurement: draft.measurement,
      },
      "custom",
    );
    setIsModalOpen(false);
  };

  return (
    <>
      {!hasDecision && (
        <aside className="cookie-banner" role="dialog" aria-labelledby="cookie-banner-title" aria-modal="false">
          <div className="cookie-banner__glow" aria-hidden="true" />
          <div className="cookie-banner__copy">
            <span className="cookie-banner__eyebrow">{pathLabel}</span>
            <h2 id="cookie-banner-title">Cookies and browser storage preferences</h2>
            <p>
              LandCheck uses cookies and similar browser storage to keep the site secure, remember preferences, and
              optionally enable richer media and measurement. You can accept all, keep essential only, or customize
              your choices.
            </p>
            <div className="cookie-banner__meta">
              <Link to={PRIVACY_POLICY_PATH}>Privacy policy</Link>
              <span>No advertising cookies</span>
            </div>
          </div>
          <div className="cookie-banner__actions">
            <button type="button" className="cookie-btn cookie-btn--ghost" onClick={openPreferences}>
              Customize
            </button>
            <button type="button" className="cookie-btn cookie-btn--subtle" onClick={acceptEssentialOnly}>
              Essential only
            </button>
            <button type="button" className="cookie-btn cookie-btn--primary" onClick={acceptAll}>
              Accept all
            </button>
          </div>
        </aside>
      )}

      {isModalOpen && (
        <div className="cookie-modal-backdrop" role="presentation" onClick={closePreferences}>
          <div
            className="cookie-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cookie-modal__header">
              <span className="cookie-modal__eyebrow">Privacy controls</span>
              <button type="button" className="cookie-modal__close" onClick={closePreferences} aria-label="Close">
                ×
              </button>
              <h2 id="cookie-modal-title">Choose how LandCheck uses browser storage</h2>
              <p>
                Essential storage stays on because it is required for secure access and core site functions. Optional
                categories help with richer presentation and future measurement, but they are your choice.
              </p>
            </div>

            <div className="cookie-modal__grid">
              {cookieCategories.map((category) => {
                const checked = draft[category.key];
                return (
                  <section key={category.key} className={`cookie-preference-card${category.locked ? " is-locked" : ""}`}>
                    <div className="cookie-preference-card__top">
                      <div>
                        <h3>{category.title}</h3>
                        <p>{category.summary}</p>
                      </div>
                      <label className={`cookie-toggle${checked ? " is-on" : ""}${category.locked ? " is-disabled" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={category.locked}
                          onChange={(event) => {
                            if (category.locked) return;
                            const nextChecked = event.target.checked;
                            setDraft((current) => ({
                              ...current,
                              [category.key]: nextChecked,
                            }));
                          }}
                        />
                        <span className="cookie-toggle__track" aria-hidden="true">
                          <span className="cookie-toggle__thumb" />
                        </span>
                      </label>
                    </div>
                    <div className="cookie-preference-card__footer">
                      {category.locked ? "Always active" : checked ? "Enabled" : "Off"}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="cookie-modal__footnote">
              <p>
                You can update these preferences at any time from the cookie settings button shown across the site.
              </p>
              <Link to={PRIVACY_POLICY_PATH} onClick={closePreferences}>
                Read the privacy policy
              </Link>
            </div>

            <div className="cookie-modal__actions">
              <button type="button" className="cookie-btn cookie-btn--subtle" onClick={handleAcceptEssentialOnly}>
                Essential only
              </button>
              <button type="button" className="cookie-btn cookie-btn--ghost" onClick={saveCustomPreferences}>
                Save preferences
              </button>
              <button type="button" className="cookie-btn cookie-btn--primary" onClick={handleAcceptAll}>
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
