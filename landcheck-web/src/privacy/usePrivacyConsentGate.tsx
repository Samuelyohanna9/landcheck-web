import { useCallback, useMemo, useRef, useState } from "react";
import {
  acceptPrivacyConsent,
  getPrivacyScopeCopy,
  hasLocalPrivacyConsent,
  PRIVACY_POLICY_PATH,
  type PrivacyScope,
  type PrivacySourceApp,
} from "./privacyConsent";

type EnsureConsentOptions = {
  title?: string;
  detail?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
};

type PendingConsentState = {
  scope: PrivacyScope;
  title?: string;
  detail?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
};

export const usePrivacyConsentGate = (sourceApp: PrivacySourceApp) => {
  const [pendingConsent, setPendingConsent] = useState<PendingConsentState | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null);

  const closeConsent = useCallback((accepted: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setPendingConsent(null);
    setSavingConsent(false);
    if (resolver) {
      resolver(accepted);
    }
  }, []);

  const ensureConsent = useCallback(
    (scope: PrivacyScope, options: EnsureConsentOptions = {}) => {
      if (hasLocalPrivacyConsent(scope, sourceApp)) {
        return Promise.resolve(true);
      }
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setPendingConsent({
          scope,
          title: options.title,
          detail: options.detail,
          actionLabel: options.actionLabel,
          metadata: options.metadata,
        });
      });
    },
    [sourceApp],
  );

  const confirmConsent = useCallback(async () => {
    if (!pendingConsent || savingConsent) return;
    const copy = getPrivacyScopeCopy(pendingConsent.scope);
    setSavingConsent(true);
    await acceptPrivacyConsent(pendingConsent.scope, sourceApp, {
      consentText: pendingConsent.detail || copy.summary,
      metadata: pendingConsent.metadata,
    });
    closeConsent(true);
  }, [closeConsent, pendingConsent, savingConsent, sourceApp]);

  const scopeCopy = pendingConsent ? getPrivacyScopeCopy(pendingConsent.scope) : null;

  const privacyConsentModal = useMemo(() => {
    if (!pendingConsent || !scopeCopy) return null;
    return (
      <div className="privacy-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="privacy-consent-title">
        <div className="privacy-modal-card">
          <p className="privacy-modal-eyebrow">Consent Required</p>
          <h2 id="privacy-consent-title">{pendingConsent.title || scopeCopy.title}</h2>
          <p className="privacy-modal-summary">{pendingConsent.detail || scopeCopy.summary}</p>
          <ul className="privacy-modal-list">
            {scopeCopy.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="privacy-modal-footnote">
            Continue only if you are authorized to collect or process this data for the project or organization.
            <a href={PRIVACY_POLICY_PATH} target="_blank" rel="noreferrer">
              Review privacy policy
            </a>
          </p>
          <div className="privacy-modal-actions">
            <button type="button" className="privacy-btn subtle" onClick={() => closeConsent(false)} disabled={savingConsent}>
              Cancel
            </button>
            <button type="button" className="privacy-btn primary" onClick={() => void confirmConsent()} disabled={savingConsent}>
              {savingConsent ? "Saving..." : pendingConsent.actionLabel || "I Consent and Continue"}
            </button>
          </div>
        </div>
      </div>
    );
  }, [closeConsent, confirmConsent, pendingConsent, savingConsent, scopeCopy]);

  return {
    ensureConsent,
    privacyConsentModal,
  };
};
