import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  acceptPrivacyConsent,
  hasLocalPrivacyConsent,
  PRIVACY_POLICY_PATH,
} from "../privacy/privacyConsent";
import "../styles/privacy.css";

export default function PrivacyNoticeBanner() {
  const location = useLocation();
  const [dismissed, setDismissed] = useState(() => hasLocalPrivacyConsent("public_site_notice", "public"));

  const hidden = useMemo(() => {
    const path = location.pathname || "/";
    return path === "/green" || path === "/green-work" || path === "/privacy";
  }, [location.pathname]);

  if (dismissed || hidden) return null;

  const acknowledgeNotice = async () => {
    await acceptPrivacyConsent("public_site_notice", "public", {
      metadata: {
        path: location.pathname,
      },
    });
    setDismissed(true);
  };

  return (
    <div className="privacy-banner" role="status" aria-live="polite">
      <div className="privacy-banner-copy">
        <strong>Privacy notice</strong>
        <span>
          LandCheck uses essential browser storage, map services, and form processing on this site. If you continue,
          you acknowledge this use and the handling of any information you submit.
        </span>
      </div>
      <div className="privacy-banner-actions">
        <a href={PRIVACY_POLICY_PATH}>Privacy policy</a>
        <button type="button" onClick={() => void acknowledgeNotice()}>
          Acknowledge
        </button>
      </div>
    </div>
  );
}
