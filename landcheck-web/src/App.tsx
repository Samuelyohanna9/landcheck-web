import { Component, Suspense, useEffect, useLayoutEffect, useState, type ErrorInfo, type ReactElement, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import CookieConsentManager from "./components/CookieConsentManager";
import SeoRouteMeta from "./components/SeoRouteMeta";
import HazardLoadingAnimation from "./components/HazardLoadingAnimation";
import GreenLoadingAnimation from "./components/GreenLoadingAnimation";
import { getGreenAuthSession, isGreenAuthed, isSponsorGreenSession } from "./auth/greenAuth";
import { isWorkAuthed } from "./auth/workAuth";
import { isSurveyAuthed } from "./auth/surveyAuth";
import { getEstateAuthSession, isEstateAuthed } from "./auth/estateAuth";
import { CookieConsentProvider } from "./privacy/cookieConsent";
import { lazyWithChunkRecovery, CHUNK_RECOVERY_STORAGE_KEY } from "./utils/lazyWithChunkRecovery";

const LandingPage = lazyWithChunkRecovery(() => import("./pages/LandingPage"));
const SurveyPlan = lazyWithChunkRecovery(() => import("./pages/SurveyPlan"));
const Dashboard = lazyWithChunkRecovery(() => import("./pages/Dashboard"));
const Feedback = lazyWithChunkRecovery(() => import("./pages/Feedback"));
const AdminDashboard = lazyWithChunkRecovery(() => import("./pages/AdminDashboard"));
const EstateAdminDashboard = lazyWithChunkRecovery(() => import("./pages/EstateAdminDashboard"));
const HazardAnalysis = lazyWithChunkRecovery(() => import("./pages/HazardAnalysis"));
const Green = lazyWithChunkRecovery(() => import("./pages/Green"));
const GreenLogin = lazyWithChunkRecovery(() => import("./pages/GreenLogin"));
const GreenSponsor = lazyWithChunkRecovery(() => import("./pages/GreenSponsor"));
const GreenMerchantDashboard = lazyWithChunkRecovery(() => import("./pages/GreenMerchantDashboard"));
const GreenMerchantLogin = lazyWithChunkRecovery(() => import("./pages/GreenMerchantLogin"));
const GreenWork = lazyWithChunkRecovery(() => import("./pages/GreenWork"));
const GreenWorkLogin = lazyWithChunkRecovery(() => import("./pages/GreenWorkLogin"));
const GreenWorkRegister = lazyWithChunkRecovery(() => import("./pages/GreenWorkRegister"));
const DataDeletion = lazyWithChunkRecovery(() => import("./pages/DataDeletion"));
const EstateSocialPostsPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateSocialPostsPage"));
const EstateWhatsappInboxPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateWhatsappInboxPage"));
const EstateSmsPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateSmsPage"));
const GreenPartnersLanding = lazyWithChunkRecovery(() => import("./pages/GreenPartnersLanding"));
const GreenPublicSponsor = lazyWithChunkRecovery(() => import("./pages/GreenPublicSponsor"));
const GreenFootprintCalculator = lazyWithChunkRecovery(() => import("./pages/GreenFootprintCalculator"));
const SurveyPlanLanding = lazyWithChunkRecovery(() => import("./pages/SurveyPlanLanding"));
const SurveyGuides = lazyWithChunkRecovery(() => import("./pages/SurveyGuides"));
const FloodAnalysisLanding = lazyWithChunkRecovery(() => import("./pages/FloodAnalysisLanding"));
const CareersPage = lazyWithChunkRecovery(() => import("./pages/CareersPage"));
const NewsPage = lazyWithChunkRecovery(() => import("./pages/NewsPage"));
const NewsArticlePage = lazyWithChunkRecovery(() => import("./pages/NewsArticlePage"));
const PrivacyPolicy = lazyWithChunkRecovery(() => import("./pages/PrivacyPolicy"));
const EstateDpaPreview = lazyWithChunkRecovery(() => import("./pages/EstateDpaPreview"));
const NotFound = lazyWithChunkRecovery(() => import("./pages/NotFound"));
const DonorImpactPage = lazyWithChunkRecovery(() => import("./pages/DonorImpactPage"));
const AppClaimRedirect = lazyWithChunkRecovery(() => import("./pages/AppClaimRedirect"));
const SurveyAuthVerify = lazyWithChunkRecovery(() => import("./pages/SurveyAuthVerify"));
const SurveyAuthCallback = lazyWithChunkRecovery(() => import("./pages/SurveyAuthCallback"));
const Estates = lazyWithChunkRecovery(() => import("./pages/Estates"));
const EstateFinance = lazyWithChunkRecovery(() => import("./pages/EstateFinance"));
const EstateLanding = lazyWithChunkRecovery(() => import("./pages/EstateLanding"));
const EstateLogin = lazyWithChunkRecovery(() => import("./pages/EstateLogin"));
const EstateRegister = lazyWithChunkRecovery(() => import("./pages/EstateRegister"));
const EstateForgotPassword = lazyWithChunkRecovery(() => import("./pages/EstateForgotPassword"));
const EstateResetPassword = lazyWithChunkRecovery(() => import("./pages/EstateResetPassword"));
const EstateEmailVerified = lazyWithChunkRecovery(() => import("./pages/EstateEmailVerified"));
const EstateSetNewPassword = lazyWithChunkRecovery(() => import("./pages/EstateSetNewPassword"));
const EstateChoosePlan = lazyWithChunkRecovery(() => import("./pages/EstateChoosePlan"));
const EstateBillingPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateBillingPage"));
const EstateLegalPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateLegalPage"));
const PublicPlotView = lazyWithChunkRecovery(() => import("./pages/PublicPlotView"));
const PublicEstatePage = lazyWithChunkRecovery(() => import("./pages/PublicEstatePage"));
const PublicEstateReservationPage = lazyWithChunkRecovery(() => import("./pages/PublicEstateReservationPage"));
const EstatePlotsPage = lazyWithChunkRecovery(() => import("./pages/estates/EstatePlotsPage"));
const EstateCustomersPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateCustomersPage"));
const EstateCommissionsPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateCommissionsPage"));
const EstateSurveyPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateSurveyPage"));
const EstateStakingPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateStakingPage"));
const EstateDevelopmentPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateDevelopmentPage"));
const EstateHazardsPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateHazardsPage"));
const EstateSoilAnalysisPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateSoilAnalysisPage"));
const EstateReportsPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateReportsPage"));
const EstateAuditPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateAuditPage"));
const EstateSettingsPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateSettingsPage"));
const EstateStaffAccessPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateStaffAccessPage"));
const EstatePublicSitePage = lazyWithChunkRecovery(() => import("./pages/estates/EstatePublicSitePage"));
const AgentPortalAccessPage = lazyWithChunkRecovery(() => import("./pages/estates/AgentPortalAccessPage"));
const BuyerPortalPage = lazyWithChunkRecovery(() => import("./pages/BuyerPortalPage"));
const EstateNotificationLogPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateNotificationLogPage"));
const EstateMarketingPage = lazyWithChunkRecovery(() => import("./pages/estates/EstateMarketingPage"));
const PublicInspectionBookingPage = lazyWithChunkRecovery(() => import("./pages/estates/PublicInspectionBookingPage"));

type ChunkLoadBoundaryProps = {
  children: ReactNode;
};

type ChunkLoadBoundaryState = {
  hasError: boolean;
};

// Colour/type tokens copied from estate-portal.css (:root / .estate-portal) rather than imported,
// since this boundary wraps the entire app and can catch a failure before that stylesheet - or
// any page-specific one - is guaranteed to have loaded. Kept in sync by hand; estate-portal.css
// is the source of truth if the Estates brand colours ever change.
const ESTATE_INK = "#102a27";
const ESTATE_SLATE = "#5d6f69";
const ESTATE_PAPER = "#f5f3eb";
const ESTATE_LINE = "rgba(16, 42, 39, 0.16)";
const ESTATE_ACCENT = "#16816e";
const ESTATE_FONT_BODY = '"Aptos", "Segoe UI", Arial, sans-serif';
const ESTATE_FONT_DISPLAY = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';

class ChunkLoadBoundary extends Component<ChunkLoadBoundaryProps, ChunkLoadBoundaryState> {
  state: ChunkLoadBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ChunkLoadBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    // Intentionally swallow here and render a recovery prompt. The raw error (e.g. "Failed to
    // fetch dynamically imported module: ...") used to be shown on the card itself - it's not
    // something a visitor can act on, so it's dropped rather than displayed.
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem 1rem",
          background: ESTATE_PAPER,
          fontFamily: ESTATE_FONT_BODY,
        }}
      >
        <div
          style={{
            width: "min(92vw, 540px)",
            borderRadius: "4px",
            border: `1px solid ${ESTATE_LINE}`,
            background: "#ffffff",
            boxShadow: "0 18px 40px rgba(16, 36, 58, 0.08)",
            padding: "2rem 1.75rem",
          }}
        >
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.17em", textTransform: "uppercase", color: ESTATE_ACCENT, marginBottom: "0.9rem" }}>
            LandCheck
          </div>
          <h1 style={{ margin: "0 0 0.7rem", fontFamily: ESTATE_FONT_DISPLAY, fontWeight: 500, fontSize: "1.9rem", lineHeight: 1.15, color: ESTATE_INK }}>
            Something went wrong loading this page.
          </h1>
          <p style={{ margin: "0 0 1.3rem", color: ESTATE_SLATE, fontSize: "0.95rem", lineHeight: 1.65 }}>
            {/* This boundary catches a stale-chunk failure that survived lazyWithChunkRecovery.ts's
                own silent one-shot recovery (rare - usually a second failure in a row), and any
                other rendering error in the app. Both are handled the same way here, since a reload
                is a reasonable first step either way, but the copy no longer asserts a specific
                cause we don't actually know. */}
            This can happen after a new version is released, or from a temporary glitch. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              minHeight: "46px",
              border: "0",
              borderRadius: "2px",
              background: ESTATE_INK,
              color: "#ffffff",
              fontFamily: ESTATE_FONT_BODY,
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload LandCheck
          </button>
          <p style={{ margin: "1rem 0 0", color: ESTATE_SLATE, fontSize: "0.84rem", lineHeight: 1.5 }}>
            Still stuck after reloading?{" "}
            <a href="/" style={{ color: ESTATE_INK, fontWeight: 700, textDecoration: "underline" }}>Go to the homepage</a>
            {" "}or email{" "}
            <a href="mailto:support@landcheck.online" style={{ color: ESTATE_INK, fontWeight: 700, textDecoration: "underline" }}>support@landcheck.online</a>.
          </p>
        </div>
      </div>
    );
  }
}

function WorkProtectedRoute({ element }: { element: ReactElement }) {
  return isWorkAuthed() ? element : <Navigate to="/green-work/login" replace />;
}

function GreenProtectedRoute({ element }: { element: ReactElement }) {
  return isGreenAuthed() ? element : <Navigate to="/green/login" replace />;
}

function SurveyProtectedRoute({ element }: { element: ReactElement }) {
  return isSurveyAuthed() ? element : <Navigate to="/survey" replace />;
}

function EstateProtectedRoute({ element }: { element: ReactElement }) {
  // Estate ids are numeric. A stray link such as /estates/marketing would otherwise be read as an
  // estate called "marketing" and fire a burst of failing API calls, so send it to the picker.
  const { estateId } = useParams();
  if (estateId !== undefined && !/^\d+$/.test(estateId)) return <Navigate to="/estates/workspace" replace />;
  if (!isEstateAuthed()) return <Navigate to="/estates/login" state={{ from: window.location.pathname }} replace />;
  // A staff account invited via "Add Access" is still on its emailed temp password - block every
  // other Estates screen until they set their own, the same forced-first-login pattern most
  // dashboards use for invited accounts.
  if (getEstateAuthSession()?.user.must_change_password) return <Navigate to="/estates/set-new-password" replace />;
  return element;
}

function EstateEntryRoute() {
  return isEstateAuthed() ? <Navigate to="/estates/workspace" replace /> : <EstateLanding />;
}

function MerchantProtectedRoute({ element }: { element: ReactElement }) {
  const session = getGreenAuthSession();
  if (!session || !isSponsorGreenSession(session)) {
    return <Navigate to="/green-merchant/login" state={{ from: "/green-merchant" }} replace />;
  }
  // A merchant landing on the wrong dashboard route is a routing mistake, not an auth
  // failure — send individual/organization sponsors back to their own dashboard instead
  // of erroring, since they do have a valid session, just not this one.
  if (session.user?.account_type !== "merchant") return <Navigate to="/green" replace />;
  return element;
}

function GreenRouteSwitch() {
  const session = getGreenAuthSession();
  if (session && isSponsorGreenSession(session)) {
    // Merchants live on their own dedicated route (/green-merchant), not this shared
    // public-sponsor / organization-sponsor route.
    if (session.user?.account_type === "merchant") return <Navigate to="/green-merchant" replace />;
    return <GreenSponsor />;
  }
  return <Green />;
}

function RouteScrollManager() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || !("scrollRestoration" in window.history)) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    if (location.hash) {
      window.requestAnimationFrame(() => {
        const target = document.querySelector(location.hash);
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ block: "start" });
          return;
        }
        window.scrollTo(0, 0);
      });
      return;
    }

    window.scrollTo(0, 0);
  }, [location.pathname, location.search, location.hash]);

  return null;
}

// Suspense's fallback for every lazy route below - shown any time a route's own JS chunk is
// still downloading (first visit to a page, or a slow connection re-fetching after a deploy).
// Public product landings intentionally stay free of the in-app loading animation. Estates,
// LandCheck Work, and Survey all share the same quiet, compact mark (the one that used to be
// Estates-only) rather than each having its own look - only the public Green field app and the
// Hazard/Flood tool keep their own larger, more illustrated fallback.
//
// How long this fallback can be on screen before the person sees a way out. This is Suspense
// waiting on a lazy import()'s promise - if that request just hangs (common for a few seconds
// while a reverse proxy or container is mid-restart during a deploy) rather than cleanly
// rejecting, nothing ever throws for lazyWithChunkRecovery.ts or ChunkLoadBoundary to catch, so
// without this the person is left looking at a spinner with no error and no escape hatch.
const STUCK_LOADING_MS = 7000;

function RouteLoadingFallback() {
  const { pathname } = useLocation();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    setStuck(false);
    const handle = window.setTimeout(() => setStuck(true), STUCK_LOADING_MS);
    return () => window.clearTimeout(handle);
    // Re-arm the timer per pathname, same scope the recovery guard itself uses.
  }, [pathname]);

  const path = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  const isEstateRoute = path.startsWith("/estates") || path.startsWith("/estate-admin");
  const isGreenWorkRoute = path.startsWith("/green-work");
  const isSurveyRoute = path.startsWith("/survey") || path.startsWith("/dashboard");
  const useCompactMark = isEstateRoute || isGreenWorkRoute || isSurveyRoute;
  const showsOwnAnimation = !["/survey", "/survey/guides", "/flood", "/green-partners"].includes(path);

  let Animation: typeof GreenLoadingAnimation | null = null;
  if (showsOwnAnimation) {
    if (useCompactMark) {
      Animation = GreenLoadingAnimation;
    } else if (path.startsWith("/hazard-analysis") || path.startsWith("/flood")) {
      Animation = HazardLoadingAnimation;
    } else if (path.startsWith("/green")) {
      Animation = GreenLoadingAnimation;
    }
  }

  if (!Animation && !stuck) return null;

  return (
    <div className="route-loading-fallback">
      {Animation && <Animation size={useCompactMark ? "small" : "large"} className={useCompactMark ? "estate-loading-animation" : undefined} />}
      {stuck && (
        <div className="route-loading-stuck-hint" role="status">
          <p>Taking longer than usual to load.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // This effect fires the instant <App> itself mounts - the lazy route content below it is a
    // Suspense-wrapped CHILD, and React does not wait for a Suspense boundary to resolve before
    // running an ancestor's effects. So this cannot safely run immediately: on a route whose
    // chunk is about to fail, it would wipe the recovery budget back to zero (lazyWithChunkRecovery.ts
    // / index.html's entry-bundle guard) before that failure has even happened, defeating the
    // one-shot cap entirely and letting a mid-deploy failure reload in a loop instead of stopping
    // after one attempt. Deferring the reset behind a short delay fixes this: if a reload fires
    // because the chunk failed, window.location.reload() tears down this whole JS context before
    // the timeout below can run, so the reset only ever "sticks" on a load that's genuinely still
    // alive a few seconds later - i.e. one that actually succeeded.
    const handle = window.setTimeout(() => {
      const recoveryKey = `${CHUNK_RECOVERY_STORAGE_KEY}:${window.location.pathname}`;
      window.sessionStorage.removeItem(recoveryKey);
      window.sessionStorage.removeItem(`${CHUNK_RECOVERY_STORAGE_KEY}:attempts`);
      // The entry-bundle guard set by index.html's own inline bootstrap script, ahead of this.
      window.sessionStorage.removeItem("landcheck.entry-reload-attempted");
    }, 4000);
    return () => window.clearTimeout(handle);
  }, []);

  return (
    <BrowserRouter>
      <CookieConsentProvider>
        <RouteScrollManager />
        <SeoRouteMeta />
        <CookieConsentManager />
        <ChunkLoadBoundary>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/survey-plan" element={<SurveyPlan />} />
              <Route path="/hazard-analysis" element={<HazardAnalysis />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/estates/data-processing-agreement" element={<EstateDpaPreview />} />
              <Route path="/data-deletion" element={<DataDeletion />} />
              <Route path="/green/login" element={<GreenLogin />} />
              <Route path="/green/login/:authRoute" element={<GreenLogin />} />
              <Route path="/green" element={<GreenProtectedRoute element={<GreenRouteSwitch />} />} />
              <Route path="/green-merchant/login" element={<GreenMerchantLogin />} />
              <Route path="/green-merchant" element={<MerchantProtectedRoute element={<GreenMerchantDashboard />} />} />
              <Route path="/green-work/login" element={<GreenWorkLogin />} />
              <Route path="/green-work/register" element={<GreenWorkRegister />} />
              <Route path="/green-work" element={<WorkProtectedRoute element={<GreenWork />} />} />
              <Route path="/survey" element={<SurveyPlanLanding />} />
              <Route path="/survey/guides" element={<SurveyGuides />} />
              <Route path="/survey/auth/verify" element={<SurveyAuthVerify />} />
              <Route path="/survey/auth/callback" element={<SurveyAuthCallback />} />
              <Route path="/estates" element={<EstateEntryRoute />} />
              <Route path="/estates/login" element={<EstateLogin />} />
              <Route path="/estates/register" element={<EstateRegister />} />
              <Route path="/estates/forgot-password" element={<EstateForgotPassword />} />
              <Route path="/estates/reset-password" element={<EstateResetPassword />} />
              <Route path="/estates/email-verified" element={<EstateEmailVerified />} />
              <Route path="/estates/set-new-password" element={<EstateSetNewPassword />} />
              <Route path="/estates/choose-plan" element={<EstateProtectedRoute element={<EstateChoosePlan />} />} />
              <Route path="/estates/billing" element={<EstateProtectedRoute element={<EstateBillingPage />} />} />
              <Route path="/estates/legal" element={<EstateProtectedRoute element={<EstateLegalPage />} />} />
              <Route path="/estates/plot/:token" element={<PublicPlotView />} />
              <Route path="/estates/buyer/:token" element={<BuyerPortalPage />} />
              <Route path="/estates/agent-portal/:token" element={<AgentPortalAccessPage />} />
              <Route path="/estates/inspection/:token" element={<PublicInspectionBookingPage />} />
              <Route path="/estates/public/:slug/reserve/:plotId" element={<PublicEstateReservationPage />} />
              <Route path="/estates/public/:slug" element={<PublicEstatePage />} />
              <Route path="/estates/workspace" element={<EstateProtectedRoute element={<Estates />} />} />
              <Route path="/estates/:estateId" element={<EstateProtectedRoute element={<Estates />} />} />
              <Route path="/estates/:estateId/map" element={<EstateProtectedRoute element={<Estates />} />} />
              <Route path="/estates/:estateId/plots" element={<EstateProtectedRoute element={<EstatePlotsPage />} />} />
              <Route path="/estates/:estateId/customers" element={<EstateProtectedRoute element={<EstateCustomersPage />} />} />
              <Route path="/estates/:estateId/survey" element={<EstateProtectedRoute element={<EstateSurveyPage />} />} />
              <Route path="/estates/:estateId/staking" element={<EstateProtectedRoute element={<EstateStakingPage />} />} />
              <Route path="/estates/:estateId/development" element={<EstateProtectedRoute element={<EstateDevelopmentPage />} />} />
              <Route path="/estates/:estateId/hazards" element={<EstateProtectedRoute element={<EstateHazardsPage />} />} />
              <Route path="/estates/:estateId/soil-analysis" element={<EstateProtectedRoute element={<EstateSoilAnalysisPage />} />} />
              <Route path="/estates/:estateId/reports" element={<EstateProtectedRoute element={<EstateReportsPage />} />} />
              <Route path="/estates/:estateId/timeline" element={<EstateProtectedRoute element={<EstateAuditPage />} />} />
              <Route path="/estates/:estateId/public-site" element={<EstateProtectedRoute element={<EstatePublicSitePage />} />} />
              <Route path="/estates/:estateId/access" element={<EstateProtectedRoute element={<EstateStaffAccessPage />} />} />
              <Route path="/estates/:estateId/settings" element={<EstateProtectedRoute element={<EstateSettingsPage />} />} />
              <Route path="/estates/:estateId/notifications" element={<EstateProtectedRoute element={<EstateNotificationLogPage />} />} />
              <Route path="/estates/:estateId/marketing" element={<EstateProtectedRoute element={<EstateMarketingPage />} />} />
              <Route path="/estates/:estateId/marketing/posts" element={<EstateProtectedRoute element={<EstateSocialPostsPage />} />} />
              <Route path="/estates/:estateId/marketing/whatsapp" element={<EstateProtectedRoute element={<EstateWhatsappInboxPage />} />} />
              <Route path="/estates/:estateId/sms" element={<EstateProtectedRoute element={<EstateSmsPage />} />} />
              <Route path="/estates/payments" element={<EstateProtectedRoute element={<EstateFinance mode="payments" />} />} />
              <Route path="/estates/reconciliation" element={<Navigate to="/estates/payments" replace />} />
              <Route path="/estates/commissions" element={<EstateProtectedRoute element={<EstateCommissionsPage />} />} />
              <Route path="/estates/documents" element={<EstateProtectedRoute element={<EstateFinance mode="documents" />} />} />
              <Route path="/flood" element={<FloodAnalysisLanding />} />
              <Route path="/career" element={<CareersPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/news/:slug" element={<NewsArticlePage />} />
              <Route path="/green-partners" element={<GreenPartnersLanding />} />
              <Route path="/sponsor" element={<GreenPublicSponsor />} />
              <Route path="/sponsor/calculator" element={<GreenFootprintCalculator />} />
              <Route path="/impact/:orgSlug" element={<DonorImpactPage />} />
              <Route path="/app/claim" element={<AppClaimRedirect />} />
              <Route path="/dashboard" element={<SurveyProtectedRoute element={<Dashboard />} />} />
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/estate-admin" element={<EstateAdminDashboard />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ChunkLoadBoundary>
      </CookieConsentProvider>
    </BrowserRouter>
  );
}
