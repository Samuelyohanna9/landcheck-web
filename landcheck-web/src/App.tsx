import { Component, lazy, Suspense, useEffect, useLayoutEffect, type ComponentType, type ErrorInfo, type ReactElement, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import CookieConsentManager from "./components/CookieConsentManager";
import SeoRouteMeta from "./components/SeoRouteMeta";
import { getGreenAuthSession, isGreenAuthed, isSponsorGreenSession } from "./auth/greenAuth";
import { isWorkAuthed } from "./auth/workAuth";
import { isSurveyAuthed } from "./auth/surveyAuth";
import { CookieConsentProvider } from "./privacy/cookieConsent";

const CHUNK_RECOVERY_STORAGE_KEY = "landcheck.chunk-recovery";
const CHUNK_ERROR_PATTERN = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i;

const lazyWithChunkRecovery = <T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
) =>
  lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      const canRecover =
        typeof window !== "undefined" &&
        import.meta.env.PROD &&
        CHUNK_ERROR_PATTERN.test(message);
      if (canRecover) {
        const recoveryKey = `${CHUNK_RECOVERY_STORAGE_KEY}:${window.location.pathname}`;
        const recoveredAlready = window.sessionStorage.getItem(recoveryKey) === "1";
        if (!recoveredAlready) {
          window.sessionStorage.setItem(recoveryKey, "1");
          // Clear Cache Storage (and nudge the service worker to check for an update) BEFORE
          // reloading, not just after - a reload alone can still be served the same stale
          // cached chunk by the service worker, making this one-shot recovery a no-op and
          // pushing the user straight to the visible ChunkLoadBoundary card below.
          try {
            if ("caches" in window) {
              const cacheKeys = await caches.keys();
              await Promise.all(cacheKeys.map((key) => caches.delete(key)));
            }
            if ("serviceWorker" in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              await Promise.all(registrations.map((registration) => registration.update().catch(() => {})));
            }
          } catch {
            // Best-effort cleanup - still reload even if clearing caches failed.
          }
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw error;
    }
  });

const LandingPage = lazyWithChunkRecovery(() => import("./pages/LandingPage"));
const SurveyPlan = lazyWithChunkRecovery(() => import("./pages/SurveyPlan"));
const Dashboard = lazyWithChunkRecovery(() => import("./pages/Dashboard"));
const Feedback = lazyWithChunkRecovery(() => import("./pages/Feedback"));
const AdminDashboard = lazyWithChunkRecovery(() => import("./pages/AdminDashboard"));
const HazardAnalysis = lazyWithChunkRecovery(() => import("./pages/HazardAnalysis"));
const Green = lazyWithChunkRecovery(() => import("./pages/Green"));
const GreenLogin = lazyWithChunkRecovery(() => import("./pages/GreenLogin"));
const GreenSponsor = lazyWithChunkRecovery(() => import("./pages/GreenSponsor"));
const GreenMerchantDashboard = lazyWithChunkRecovery(() => import("./pages/GreenMerchantDashboard"));
const GreenMerchantLogin = lazyWithChunkRecovery(() => import("./pages/GreenMerchantLogin"));
const GreenWork = lazyWithChunkRecovery(() => import("./pages/GreenWork"));
const GreenWorkLogin = lazyWithChunkRecovery(() => import("./pages/GreenWorkLogin"));
const GreenPartnersLanding = lazyWithChunkRecovery(() => import("./pages/GreenPartnersLanding"));
const GreenPublicSponsor = lazyWithChunkRecovery(() => import("./pages/GreenPublicSponsor"));
const GreenFootprintCalculator = lazyWithChunkRecovery(() => import("./pages/GreenFootprintCalculator"));
const SurveyPlanLanding = lazyWithChunkRecovery(() => import("./pages/SurveyPlanLanding"));
const FloodAnalysisLanding = lazyWithChunkRecovery(() => import("./pages/FloodAnalysisLanding"));
const CareersPage = lazyWithChunkRecovery(() => import("./pages/CareersPage"));
const NewsPage = lazyWithChunkRecovery(() => import("./pages/NewsPage"));
const NewsArticlePage = lazyWithChunkRecovery(() => import("./pages/NewsArticlePage"));
const PrivacyPolicy = lazyWithChunkRecovery(() => import("./pages/PrivacyPolicy"));
const DonorImpactPage = lazyWithChunkRecovery(() => import("./pages/DonorImpactPage"));
const AppClaimRedirect = lazyWithChunkRecovery(() => import("./pages/AppClaimRedirect"));
const SurveyAuthVerify = lazyWithChunkRecovery(() => import("./pages/SurveyAuthVerify"));
const SurveyAuthCallback = lazyWithChunkRecovery(() => import("./pages/SurveyAuthCallback"));

type ChunkLoadBoundaryProps = {
  children: ReactNode;
};

type ChunkLoadBoundaryState = {
  hasError: boolean;
  message: string;
};

class ChunkLoadBoundary extends Component<ChunkLoadBoundaryProps, ChunkLoadBoundaryState> {
  state: ChunkLoadBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): ChunkLoadBoundaryState {
    const message = error instanceof Error ? error.message : "A page asset failed to load.";
    return {
      hasError: true,
      message,
    };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    // Intentionally swallow here and render a recovery prompt.
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
          background: "linear-gradient(180deg, #f4fbf6 0%, #ffffff 100%)",
        }}
      >
        <div
          style={{
            width: "min(92vw, 540px)",
            borderRadius: "24px",
            border: "1px solid rgba(17, 61, 36, 0.14)",
            background: "#ffffff",
            boxShadow: "0 24px 60px rgba(20, 61, 39, 0.12)",
            padding: "1.5rem",
          }}
        >
          <div style={{ fontSize: "0.78rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#24804a", marginBottom: "0.8rem" }}>
            LandCheck Update
          </div>
          <h1 style={{ margin: "0 0 0.6rem", fontSize: "1.8rem", lineHeight: 1.1, color: "#133525" }}>
            This page needs a fresh reload.
          </h1>
          <p style={{ margin: "0 0 1rem", color: "#51695b", lineHeight: 1.6 }}>
            A new version of LandCheck was deployed while this browser still had an older page shell open.
            Reload once to fetch the latest files.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              minHeight: "50px",
              border: "0",
              borderRadius: "16px",
              background: "linear-gradient(180deg, #2aa85f 0%, #1d7e46 100%)",
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Reload LandCheck
          </button>
          <p style={{ margin: "0.85rem 0 0", color: "#7b9084", fontSize: "0.84rem", lineHeight: 1.5 }}>
            If it still fails after reload, clear the site cache or redeploy the latest build assets.
          </p>
          {this.state.message ? (
            <pre
              style={{
                margin: "0.9rem 0 0",
                padding: "0.8rem",
                borderRadius: "14px",
                background: "#f6faf7",
                color: "#6a7d71",
                fontSize: "0.72rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {this.state.message}
            </pre>
          ) : null}
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

export default function App() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const recoveryKey = `${CHUNK_RECOVERY_STORAGE_KEY}:${window.location.pathname}`;
    window.sessionStorage.removeItem(recoveryKey);
  }, []);

  return (
    <BrowserRouter>
      <CookieConsentProvider>
        <RouteScrollManager />
        <SeoRouteMeta />
        <CookieConsentManager />
        <ChunkLoadBoundary>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/survey-plan" element={<SurveyPlan />} />
              <Route path="/hazard-analysis" element={<HazardAnalysis />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/green/login" element={<GreenLogin />} />
              <Route path="/green/login/:authRoute" element={<GreenLogin />} />
              <Route path="/green" element={<GreenProtectedRoute element={<GreenRouteSwitch />} />} />
              <Route path="/green-merchant/login" element={<GreenMerchantLogin />} />
              <Route path="/green-merchant" element={<MerchantProtectedRoute element={<GreenMerchantDashboard />} />} />
              <Route path="/green-work/login" element={<GreenWorkLogin />} />
              <Route path="/green-work" element={<WorkProtectedRoute element={<GreenWork />} />} />
              <Route path="/survey" element={<SurveyPlanLanding />} />
              <Route path="/survey/auth/verify" element={<SurveyAuthVerify />} />
              <Route path="/survey/auth/callback" element={<SurveyAuthCallback />} />
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
            </Routes>
          </Suspense>
        </ChunkLoadBoundary>
      </CookieConsentProvider>
    </BrowserRouter>
  );
}
