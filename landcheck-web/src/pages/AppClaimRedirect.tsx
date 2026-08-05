import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=online.landcheck.mobile";
const REDIRECT_FALLBACK_MS = 1600;

/**
 * Deferred deep-link landing page: the app has no Android App Links config (only the bare
 * `landcheckmobile://` scheme), so email/SMS links must point at a normal https URL. This page
 * attempts the custom-scheme deep link on load, then falls back to the Play Store if the app
 * doesn't intercept it in time (not installed, or an email client webview blocking the redirect).
 */
export default function AppClaimRedirect() {
  const [searchParams] = useSearchParams();
  const [redirecting, setRedirecting] = useState(true);

  const sponsorId = searchParams.get("sponsor_id") || "";
  const email = searchParams.get("email") || "";

  const deepLinkUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (sponsorId) params.set("sponsor_id", sponsorId);
    if (email) params.set("email", email);
    return `landcheckmobile://sponsor/claim?${params.toString()}`;
  }, [sponsorId, email]);

  useEffect(() => {
    if (!sponsorId || !email) {
      setRedirecting(false);
      return;
    }
    window.location.href = deepLinkUrl;
    const timer = window.setTimeout(() => {
      setRedirecting(false);
      window.location.href = PLAY_STORE_URL;
    }, REDIRECT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [deepLinkUrl, sponsorId, email]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "linear-gradient(180deg, #f4faf5 0%, #e7f4ea 100%)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "min(100%, 420px)",
          background: "#ffffff",
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: "0 18px 46px rgba(14,46,28,0.14)",
          border: "1px solid #dceee0",
        }}
      >
        <div
          style={{
            padding: "28px 28px 24px",
            background: "linear-gradient(145deg,#0c5f2e 0%,#1d8a49 55%,#2aa852 100%)",
            color: "#ffffff",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#d6f5df" }}>
            LandCheck Green
          </div>
          <div style={{ marginTop: 10, fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
            {redirecting ? "Opening the app..." : "Get the LandCheck Green app"}
          </div>
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: "#eafcee" }}>
            {redirecting
              ? "If it doesn't open automatically, we'll take you to Google Play in a moment."
              : "Install the app, then use the same link again to set your password and see your tree."}
          </div>
        </div>
        <div style={{ padding: "24px 28px 28px" }}>
          <a
            href={PLAY_STORE_URL}
            style={{
              display: "inline-block",
              width: "100%",
              boxSizing: "border-box",
              textAlign: "center",
              padding: "14px 22px",
              borderRadius: 999,
              background: "linear-gradient(135deg,#1f8c58,#0f6f39)",
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 800,
              textDecoration: "none",
              boxShadow: "0 10px 22px rgba(15,111,57,0.28)",
            }}
          >
            Get it on Google Play
          </a>
          {sponsorId && email ? (
            <a
              href={deepLinkUrl}
              style={{
                display: "block",
                marginTop: 14,
                textAlign: "center",
                fontSize: 13,
                color: "#1f8c58",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Already have the app? Open it now
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
